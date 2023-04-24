import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { OpenAI } from "https://deno.land/x/openai/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  connect as redisConnect
} from 'https://deno.land/x/redis/mod.ts';


const ARTICLE_ONE_ID = 'article-1-123'
const ARTICLE_ONE = "Mohamed Salah and Diogo Jota both scored twice as Liverpool claimed a first win in five Premier League games by inflicting a second successive home hammering on Leeds United, who remain mired in a relegation battle. The Reds had not won since putting seven unanswered goals past Manchester United at the start of March, but after a slow start they ruthlessly dismantled Javi Gracia's hapless side. Trent Alexander-Arnold used an arm to control the ball but neither the referee or the VAR felt it worthy of penalising, before he drove forward to exchange passes with Salah and set up Cody Gakpo for the opener. The Egypt forward doubled his side's lead soon after, firing a sweet shot in after being set up by Jota to put the visitors in control. Leeds were given hope after the break when Luis Sinisterra dispossessed the ponderous Ibrahima Konate and cleverly chipped the ball beyond Alisson. However, Liverpool quickly responded through Jota's neat finish as the Portugal forward notched his first goal since April 2022. After seeing a goal ruled out for offside, Salah then slotted home his second at the end of a superb move to put the game to bed before Jota grabbed his second when he steered in a Jordan Henderson cross. Substitute Darwin Nunez completed the rout with a neat side-foot finish against a shambolic Whites side, who conceded five last weekend at home to Crystal Palace and now have the worst defensive record in the Premier League. On an encouraging night for the visitors, there was also a return to action for Luis Diaz as the Colombia winger made his first appearance since October as a late substitute. Jurgen Klopp's side remain eighth in the table, a point behind seventh-placed Brighton and two shy of Aston Villa in sixth.";
const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";

serve(async (req: Request) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_API_URL'),
      Deno.env.get('SUPABASE_API_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

      const redisClient = await redisConnect({
        hostname: "fly-easy-japanese-football-redis.upstash.io",
        port: 6379,
        password: Deno.env.get('REDIS_PW'),
        maxRetryCount: 10,
        retryInterval: 100000,
      });      
      
      let translatedAndSimplified;
      const translatedAlr = await redisClient.get(ARTICLE_ONE_ID)
      const headers = new Headers();
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      headers.set('Content-Type', 'application/json');
      
      if (translatedAlr){
        translatedAndSimplified = translatedAlr
        return new Response(JSON.stringify(translatedAndSimplified), {
          headers,
          status: 200,
        })
      }

      const translatedArticle = await translateTextToJapanese(ARTICLE_ONE)
      translatedAndSimplified = await rewriteToN5Japanese(translatedArticle.translations[0].text)
      await redisClient.set(ARTICLE_ONE_ID,translatedAndSimplified)

      return new Response(JSON.stringify(translatedAndSimplified), {
        headers,
        status: 200,
      })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})


async function rewriteToN5Japanese(text) {
  try {
    const openAI = new OpenAI(Deno.env.get('OPENAI_API_KEY'));
    const response = await openAI.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "わかりやすい日本語を書くのが得意な親切なアシスタントさんですね。特にn-5レベルの外国人向けの文章を得意としています。", // You are a helpful assistant that is great at writing easy-to-understand Japanese. You are especially good at writing for n-5 level foreigners.
        },
        {
          role: "user",
          content: `以下の文章を、N5レベルの簡単な文章に書き換える。: ${text}`, // Rewrite the following text into simple N5 level text
        },
      ],
      max_tokens: 200, // Limit the response length
    });

    const translatedText = response.choices[0].message.content.trim();
    return translatedText;
  } catch (error) {
    console.error('Error translating text:', error);
    return '';
  }
}

async function translateTextToJapanese(text: string): Promise<string> {
  const response = await fetch(DEEPL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `DeepL-Auth-Key ${Deno.env.get('DEEPL_API_KEY')}`,
    },
    body: new URLSearchParams({
      text: text,
      target_lang: "JA",
    }),
  });
  const data = await response.json();

  if (data.error) {
    throw new Error(`DeepL API Error: ${data.error.message}`);
  }
  return data
}