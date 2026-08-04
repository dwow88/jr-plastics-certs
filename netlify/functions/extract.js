// v3 Fixed JSON extraction
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const { imageBase64 } = JSON.parse(event.body);
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image data' }) };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_API_KEY not configured' }) };
    }

    const prompt = `Extract data from JR Plastics certification. Return ONLY this JSON format with no other text:
{"po_number":"","pallet_number":"","railcar_number":"","date":"","pieces":"","packer":"","operator":"","t1":"","t2":"","t3":"","t4":"","t5":"","t6":"","t7":"","t8":"","t9":"","t10":"","t11":"","t12":"","t13":"","t14":"","t15":"","t16":"","t17":"","t18":"","t19":"","length":"","width":"","surface_finish":"","qc_date":"","upf_receiver":"","recv_date":"","recv_time":""}`;

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
      return { statusCode: 429, body: JSON.stringify({ error: 'Rate limited - wait 30 seconds' }) };
    }

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: `API error ${response.status}` }) };
    }

    const json = await response.json();
    let text = json.choices?.[0]?.message?.content || '';

    if (!text) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Empty response from Groq' }) };
    }

    // Aggressively clean response
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    text = text.replace(/```json/gi, '');
    text = text.replace(/```/gi, '');
    text = text.replace(/^[^{]*/g, ''); // Remove everything before first {
    text = text.replace(/[^}]*$/g, ''); // Remove everything after last }
    text = text.trim();

    // Try to parse
    try {
      const result = JSON.parse(text);
      return { statusCode: 200, body: JSON.stringify(result) };
    } catch (e) {
      // Last resort - try to find ANY JSON in the response
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) {
        try {
          const result = JSON.parse(match[0]);
          return { statusCode: 200, body: JSON.stringify(result) };
        } catch (e2) {
          return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse JSON from response' }) };
        }
      }

      // Return empty JSON if nothing works
      return { 
        statusCode: 200, 
        body: JSON.stringify({
          po_number:"",pallet_number:"",railcar_number:"",date:"",pieces:"",packer:"",operator:"",
          t1:"",t2:"",t3:"",t4:"",t5:"",t6:"",t7:"",t8:"",t9:"",t10:"",t11:"",t12:"",t13:"",t14:"",t15:"",t16:"",t17:"",t18:"",t19:"",
          length:"",width:"",surface_finish:"",qc_date:"",upf_receiver:"",recv_date:"",recv_time:""
        })
      };
    }

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Unknown error' }) };
  }
};
