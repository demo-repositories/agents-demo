import {createClient} from '@sanity/client'
import {projectId, dataset, token} from '../env'

// Validate environment variables
if (!projectId || !dataset || !token) {
  throw new Error('Missing required Sanity environment variables. Please check your .env file.')
}

interface SanityDocument {
  _id: string
  _type: string
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: '2024-03-19',
  perspective: 'raw',
  useCdn: false,
})

const keepId = '9d1e0998-7d85-47b5-abf0-a52360dc1674'

async function deleteDocuments(type: string, keepId?: string) {
  try {
    console.log(`Starting deletion process for ${type} documents`)

    // Build query based on whether we have a keepId
    const query = keepId ? `*[_type == "${type}" && _id != "${keepId}"]` : `*[_type == "${type}"]`

    const docs = await client.fetch(query)
    console.log(
      `Found ${type} documents to delete:`,
      docs.map((p: SanityDocument) => p._id),
    )

    if (docs.length === 0) {
      console.log(`No ${type} documents found to delete`)
      return
    }

    // Delete documents in parallel
    const deletePromises = docs.map(async (doc: SanityDocument) => {
      try {
        console.log(`Attempting to delete ${type} document:`, doc._id)

        // Delete the document
        const result = await client.delete(doc._id)
        console.log('Delete result:', result)

        // Wait a moment to ensure deletion propagates
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Verify the document is actually gone
        const deletedDoc = await client.fetch(`*[_id == "${doc._id}"][0]`)
        if (deletedDoc) {
          console.error(`Document still exists after deletion:`, doc._id)
          // Try one more time
          await client.delete(doc._id)
        }

        console.log(`Successfully deleted ${type} document:`, doc._id)
      } catch (error) {
        console.error(`Error deleting ${type} document:`, doc._id, error)
        // Try one more time
        try {
          await client.delete(doc._id)
        } catch (retryError) {
          console.error(`Failed retry deletion for ${type} document:`, doc._id, retryError)
        }
      }
    })

    // Wait for all deletions to complete
    await Promise.all(deletePromises)

    // Wait a moment before final verification
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify final state
    const remainingDocs = await client.fetch(query)
    if (remainingDocs.length > 0) {
      console.error(
        `Some ${type} documents were not deleted:`,
        remainingDocs.map((p: SanityDocument) => p._id),
      )
      // Try one final time to delete remaining documents in parallel
      const finalDeletePromises = remainingDocs.map(async (doc: SanityDocument) => {
        try {
          await client.delete(doc._id)
        } catch (error) {
          console.error(`Final attempt failed for ${type} document:`, doc._id, error)
        }
      })
      await Promise.all(finalDeletePromises)
    } else {
      console.log(`Successfully deleted all ${type} documents${keepId ? ` except ${keepId}` : ''}`)
    }
  } catch (error) {
    console.error(`Error deleting ${type} documents:`, error)
    throw error
  }
}

export const deleteAll = async () => {
  try {
    console.log('Starting deletion process with config:', {
      projectId,
      dataset,
      hasToken: !!token,
    })

    // Delete posts and translation metadata in parallel
    await Promise.all([deleteDocuments('post', keepId), deleteDocuments('translation.metadata')])

    console.log('Completed all deletion operations')
  } catch (error) {
    console.error('Error in deletion process:', error)
    throw error
  }
}

// Execute the function
// deleteAll()
