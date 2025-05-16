import {TranslateIcon} from '@sanity/icons'
import {createClient} from '@sanity/client'
import {projectId, dataset, token} from '../env'
import {DocumentActionProps} from 'sanity'
import {translate} from '../lib/translate'

export function TranslateAction(props: DocumentActionProps) {
  const document = props.draft ?? props.published
  return {
    label: 'Translate',
    icon: TranslateIcon,
    onHandle: () => {
      if (document) {
        translate({...document, id: props.id})
      }
    },
  }
}
