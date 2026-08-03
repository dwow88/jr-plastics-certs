// Netlify Function: netlify/functions/extract.js
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
      return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_API_KEY not configured on server' }) };
    }

    const prompt = `You are extracting data from a JR Plastics supplier certification form image.
Return ONLY a valid JSON object with these exact keys (use empty string "" if not found):
po_number, pallet_number, railcar_number, date (YYYY-MM-DD), pieces, packer, operator,
t1,t2,t3,t4,t5,t6,t7,t8,t9,t10,t11,t12,t13,t14,t15,t16,t17,t18,t19,t20,
length, width, surface_finish, qc_date (YYYY-MM-DD), upf_receiver,
recv_date (YYYY-MM-DD), recv_time (HH:MM).
For thickness fields (t1-t20): extract the numeric readings in order from left-to-right, top-to-bottom.
Return ONLY the JSON object, no markdown, no explanation.`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
