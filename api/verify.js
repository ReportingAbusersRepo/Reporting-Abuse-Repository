export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/reports' && request.method === 'GET') {
      return await getReports(env, corsHeaders);
    }

    if (path === '/api/reports' && request.method === 'POST') {
      return await addReport(request, env, corsHeaders);
    }

    if (path === '/api/reports/resolve' && request.method === 'PUT') {
      return await resolveReport(request, env, corsHeaders);
    }

    if (path === '/api/verify' && request.method === 'POST') {
      return await verifyAdmin(request, env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

async function getReports(env, corsHeaders) {
  try {
    const reportsData = await env.REPORTS_KV.get('reports', 'json');
    const nextId = await env.REPORTS_KV.get('nextId', 'json');
    
    return new Response(JSON.stringify({
      reports: reportsData || [],
      nextId: nextId || 1
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch reports' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function addReport(request, env, corsHeaders) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.ADMIN_PASSWORD}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { username, reason, statusType, finalStatus } = await request.json();
    
    let reports = await env.REPORTS_KV.get('reports', 'json');
    if (!reports) reports = [];
    
    let nextId = await env.REPORTS_KV.get('nextId', 'json');
    if (!nextId) nextId = 1;

    const newReport = {
      id: nextId,
      username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      reportedDate: new Date().toISOString().split('T')[0],
      statusType: statusType || 'underReview',
      finalStatus: finalStatus || null,
      reason: reason
    };

    reports.push(newReport);
    await env.REPORTS_KV.put('reports', JSON.stringify(reports));
    await env.REPORTS_KV.put('nextId', (nextId + 1).toString());

    return new Response(JSON.stringify({ success: true, report: newReport }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to add report' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function resolveReport(request, env, corsHeaders) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.ADMIN_PASSWORD}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { id, finalStatus } = await request.json();
    
    let reports = await env.REPORTS_KV.get('reports', 'json');
    if (!reports) reports = [];

    const reportIndex = reports.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    reports[reportIndex].statusType = 'resolved';
    reports[reportIndex].finalStatus = finalStatus;
    await env.REPORTS_KV.put('reports', JSON.stringify(reports));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to resolve report' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function verifyAdmin(request, env, corsHeaders) {
  try {
    const { password, token } = await request.json();

    if (password !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (token && env.TURNSTILE_SECRET_KEY) {
      const formData = new FormData();
      formData.append('secret', env.TURNSTILE_SECRET_KEY);
      formData.append('response', token);

      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData
      });

      const result = await verification.json();
      
      if (!result.success) {
        return new Response(JSON.stringify({ success: false, error: 'Verification failed' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}