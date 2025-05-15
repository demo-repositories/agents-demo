import {TrashIcon} from '@sanity/icons'
import {DocumentActionProps} from 'sanity'
import {deletePosts} from '../lib/reset'

export function DeleteAction(props: DocumentActionProps) {
  return {
    label: 'Delete All Posts',
    icon: TrashIcon,
    tone: 'critical',
    onHandle: async () => {
      try {
        await deletePosts()
        props.onComplete()
      } catch (error) {
        console.error('Error in reset action:', error)
        props.onComplete()
      }
    },
  }
}
