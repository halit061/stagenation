import { supabase } from './supabaseClient';

interface EdgeFunctionOptions {
  functionName: string;
  body?: any;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

interface EdgeFunctionResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  code?: string;
  details?: string;
}

export async function callEdgeFunction<T = any>(
  options: EdgeFunctionOptions
): Promise<EdgeFunctionResponse<T>> {
  const { functionName, body, method = 'POST' } = options;

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      return {
        ok: false,
        status: 401,
        code: 'SESSION_ERROR',
        error: 'Failed to get session',
        details: sessionError.message,
      };
    }

    if (!session || !session.access_token) {
      return {
        ok: false,
        status: 401,
        code: 'NO_SESSION',
        error: 'Not authenticated - please login',
      };
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;

    const response = await fetch(functionUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let result;
    try {
      result = await response.json();
    } catch {
      return {
        ok: false,
        status: response.status,
        code: 'PARSE_ERROR',
        error: `Server returned invalid JSON (status ${response.status})`,
      };
    }

    if (!response.ok) {
      if (response.status === 401 && result.code === 'INVALID_JWT') {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData.session) {
          return {
            ok: false,
            status: 401,
            code: 'SESSION_EXPIRED',
            error: 'Sessie verlopen, ververs de pagina en log opnieuw in',
            details: refreshError?.message,
          };
        }

        const retryResponse = await fetch(functionUrl, {
          method,
          headers: {
            'Authorization': `Bearer ${refreshData.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        const retryResult = await retryResponse.json();

        if (!retryResponse.ok) {
          return {
            ok: false,
            status: retryResponse.status,
            code: retryResult.code || 'RETRY_FAILED',
            error: retryResult.error || retryResult.message || 'Failed after token refresh',
            details: retryResult.details,
          };
        }

        return {
          ok: true,
          status: retryResponse.status,
          data: retryResult,
        };
      }

      return {
        ok: false,
        status: response.status,
        code: result.code,
        error: result.error || result.message || 'Request failed',
        details: result.details,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: result,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 500,
      code: 'UNEXPECTED_ERROR',
      error: error.message || 'Unexpected error occurred',
    };
  }
}
