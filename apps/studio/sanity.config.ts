import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {assist} from '@sanity/assist'
import {documentInternationalization} from '@sanity/document-internationalization'
import {TranslateAction} from './actions/translate'
import {dataset, projectId} from './env'
import {unsplashImageAsset} from 'sanity-plugin-asset-source-unsplash'
import {DeleteAction} from './actions/reset'
import {supportedLanguages} from './i18n'

export default defineConfig({
  name: 'default',
  title: 'SE Agent Demo',

  projectId,
  dataset,

  plugins: [
    structureTool(),
    visionTool(),
    assist({
      translate: {
        document: {
          languageField: 'language',
          documentTypes: ['post'],
        },
      },
    }),
    documentInternationalization({
      supportedLanguages,
      schemaTypes: ['post'],
    }),
    unsplashImageAsset(),
  ],

  schema: {
    types: schemaTypes,
  },
  document: {
    actions: (prev, context) => {
      return context.schemaType === 'post' && process.env.NODE_ENV === 'development'
        ? [...prev, TranslateAction, DeleteAction]
        : prev
    },
  },
})
