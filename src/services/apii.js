const API_BASE_URL = 'https://codetrack-my6j.onrender.com'

export const queryAPI = async (query) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    
    // Format the response for the frontend
    if (data.success) {
      return {
        success: true,
        message: `Found ${data.total_results || 0} results for your query.`,
        data: data.data || [],
        query: data.natural_language,
        execution_time: data.execution_time_ms
      }
    } else {
      return {
        success: false,
        message: data.error?.message || 'An error occurred while processing your query.',
        error: data.error
      }
    }
  } catch (error) {
    console.error('API Error:', error)
    throw new Error(`Failed to connect to the server: ${error.message}`)
  }
}

export const healthCheck = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/health`)
    return response.ok
  } catch (error) {
    console.error('Health check failed:', error)
    return false
  }
}
