import {translate} from '../../lib/translate'

export async function handler({context, event}) {
  const time = new Date().toLocaleTimeString()
  console.log(`👋 Your Sanity Function was called at ${time}`)
  console.log(context)
  if (
    !context
    // !context.clientOptions.projectId ||
    // context.clientOptions.projectId !== 'blneb7aj'
  ) {
    console.log('returning')
    return
  }
  if (event.data) {
    await translate({...event.data, id: event.data._id})
  }
}
