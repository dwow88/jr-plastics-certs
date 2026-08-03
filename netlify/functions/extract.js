exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { imageBase64 } = JSON.parse(event.body);
    
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image data provided' }) };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_API_KEY not configured' }) };
    }

    const prompt = `You are extracting data from a JR Plastics supplier certification form image.
Return ONLY a valid JSON object with these exact keys (use empty string "" if not found):
po_number, pallet_number, railcar_number, date (YYYY-MM-DD), pieces, packer, operator,
t1,t2,t3,t4,t5,t6,t7,t8,t9,t10,t11,t12,t13,t14,t15,t16,t17,t18,t19,t20,
length, width, surface_finish, qc_date (YYYY-MM-DD), upf_receiver,
recv_date (YYYY-MM-DD), recv_time (HH:MM).
Return ONLY the JSON object, no markdown, no explanation.`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'qwen/qwen3.6-27b',
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                { type: 'text', text: prompt }
              ]
            }]
          })
        });

        if (response.status === 429) {
          if (attempt < 2) { await new Promise(r => setTimeout(r, 8000)); continue; }
        }

        if (!response.ok) throw new Error(`Groq error ${response.status}`);

        const json = await response.json();
        let text = json.choices?.[0]?.message?.content || '';
        if (!text) throw new Error('Empty response');

        text = text.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
        let clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
        
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) clean = jsonMatch[0];
        if (!clean.startsWith('{')) throw new Error('No JSON found');

        return { statusCode: 200, body: JSON.stringify(JSON.parse(clean)) };
      } catch (error) {
        if (attempt < 2) { await new Promise(r => setTimeout(r, 8000)); continue; }
        throw error;
      }
    }
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
