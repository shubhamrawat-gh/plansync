export interface AiEnv {
  AI?: any; // Cloudflare Workers AI Binding
}

export async function getEmbedding(env: AiEnv, text: string): Promise<number[]> {
  if (!env.AI) {
    console.warn("Cloudflare Workers AI binding (AI) not found. Returning a mock 384-dim vector.");
    // Return a mock 384-dimensional vector for testing/fallback
    const vector = new Array(384).fill(0);
    // Simple hash to differentiate texts a bit
    for (let i = 0; i < text.length; i++) {
      vector[i % 384] += text.charCodeAt(i) / 1000;
    }
    // Normalize mock vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vector.map(val => val / magnitude);
  }

  try {
    const response = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
      text: [text],
    });
    
    if (response && response.data && response.data[0]) {
      return response.data[0];
    }
    throw new Error("Invalid response from Cloudflare Workers AI");
  } catch (error: any) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}
