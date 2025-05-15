import type {SanityClient, SanityDocument} from 'sanity'
import {supportedLanguages} from '../sanity.config'
import {token} from '../env'

type TranslationResult = {
  success: boolean
  language: {id: string; title: string}
  error?: unknown
  skipped?: boolean
}

const createMetadataDocument = async (
  client: SanityClient,
  documentId: string,
  newRef: {
    _key: string
    _type: string
    value: {
      _ref: string
      _type: string
    }
  },
) => {
  try {
    const metadataDoc = {
      _type: 'translation.metadata',
      translations: [newRef],
      document: {
        _type: 'reference',
        _ref: documentId,
      },
    }
    const result = await client.create(metadataDoc)
    console.log('Successfully created metadata document')
    return result
  } catch (error) {
    console.error('Error creating metadata document:', error)
    throw error
  }
}

const patchMetadataTranslations = async (
  client: SanityClient,
  metadataId: string,
  newRef: {
    _key: string
    _type: string
    value: {
      _ref: string
      _type: string
    }
  },
) => {
  try {
    await client
      .patch(metadataId)
      .setIfMissing({translations: []})
      .insert('after', 'translations[-1]', [newRef])
      .commit()
    console.log('Successfully patched metadata translations')
  } catch (error) {
    console.error('Error patching metadata translations:', error)
    throw error
  }
}

const hasTranslation = (metadata: any, languageId: string): boolean => {
  if (!metadata?.translations) return false
  return metadata.translations.some((translation: any) => translation._key === languageId)
}

const translateToLanguage = async (
  document: SanityDocument,
  translateClient: SanityClient,
  fromLanguage: {id: string; title: string},
  language: {id: string; title: string},
  metadata: any,
): Promise<TranslationResult> => {
  console.log('Translating to', language)
  try {
    const newDoc = await translateClient.agent.action.translate({
      schemaId: '_.schemas.default',
      documentId: document._id as string,
      fromLanguage,
      toLanguage: language,
      languageFieldPath: 'language',
      targetDocument: {
        operation: 'create',
      },
    })

    // Patch the new document to set its language field
    // await translateClient.patch(newDoc._id).set({language: language.id}).commit()

    const newRef = {
      _key: language.id,
      _type: 'internationalizedArrayReferenceValue',
      value: {
        _ref: newDoc._id,
        _type: 'reference',
      },
    }

    if (metadata?._id) {
      await patchMetadataTranslations(translateClient, metadata._id, newRef)
    } else {
      console.log('No metadata document found, creating new one')
      await createMetadataDocument(translateClient, document.id as string, newRef)
    }

    console.log('Translated to', language, newDoc)
    return {success: true, language}
  } catch (e) {
    console.error('Error translating to', language, e)
    return {success: false, language, error: e}
  }
}

export const translate = async (document: SanityDocument, client: SanityClient) => {
  const translateClient = client.withConfig({token, apiVersion: 'vX'})
  const fromLanguage = supportedLanguages.find((language) => language.id === document.language)

  if (!fromLanguage) {
    console.error('Source language not found in supported languages')
    return
  }

  const targetLanguages = supportedLanguages.filter((language) => language.id !== document.language)

  const translationPromises = targetLanguages.map(async (language) => {
    // TODO make observable
    const metadata = await client.fetch(
      `*[_type == "translation.metadata" && references("${document.id}")][0]`,
    )
    // Skip if translation already exists
    if (hasTranslation(metadata, language.id)) {
      console.log(`Translation to ${language.id} already exists, skipping`)
      return {success: true, language, skipped: true} as TranslationResult
    }

    return translateToLanguage(document, translateClient, fromLanguage, language, metadata)
  })

  const results = await Promise.all(translationPromises)

  const successful = results.filter((r) => r.success && !r.skipped).length
  const skipped = results.filter((r) => r.skipped).length
  const failed = results.filter((r) => !r.success).length

  console.log(
    `Translation complete: ${successful} successful, ${skipped} skipped, ${failed} failed`,
  )
}
