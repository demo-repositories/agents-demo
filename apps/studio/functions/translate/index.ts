export async function handler({context, event}) {
  const time = new Date().toLocaleTimeString()
  console.log(`👋 Your Sanity Function was called at ${time}`)
}