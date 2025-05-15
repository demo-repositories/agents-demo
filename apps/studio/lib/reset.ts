import {createClient} from '@sanity/client'
import {projectId, dataset, token} from '../env'

const client = createClient({projectId, dataset, token, apiVersion: 'vX', perspective: 'raw'})
const keepId = '9d1e0998-7d85-47b5-abf0-a52360dc1674'

export const deletePosts = async () => {
  try {
    // First check what posts exist
    const allPosts = await client.fetch(`*[_type == "post"]`)

    // Then get posts except the one we want to keep
    const posts = await client.fetch(`*[_type == "post" && _id != "${keepId}"]`)

    // Delete each post
    for (const post of posts) {
      await client.delete(post._id)
      console.log('Deleted post:', post._id)
    }

    console.log('Successfully deleted all posts except', keepId)
  } catch (error) {
    console.error('Error deleting posts:', error)
    throw error
  }
}

// Execute the function
deletePosts()
