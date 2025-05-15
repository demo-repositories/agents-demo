import {TrashIcon} from '@sanity/icons'
import {DocumentActionProps} from 'sanity'
import {deleteAll} from '../lib/reset'

export function DeleteAction(props: DocumentActionProps) {
  return {
    label: 'Delete All Posts',
    icon: TrashIcon,
    tone: 'critical',
    onHandle: async () => {
      try {
        await deleteAll()
      } catch (error) {}
    },
  }
}
