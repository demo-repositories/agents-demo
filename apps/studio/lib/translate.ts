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
    _type: 'internationalizedArrayReferenceValue'
    value: {
      _ref: string
      _type: 'reference'
    }
  },
  sourceLanguage: string,
) => {
  try {
    const metadataDoc = {
      _type: 'translation.metadata',
      translations: [
        {
          _key: sourceLanguage,
          _type: 'internationalizedArrayReferenceValue',
          value: {
            _ref: documentId,
            _type: 'reference',
          },
        },
        newRef,
      ],
    }
    const result = await client.create(metadataDoc)
    console.log('Successfully created metadata document with original document and translation')
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

    const newRef = {
      _key: language.id,
      _type: 'internationalizedArrayReferenceValue' as const,
      value: {
        _ref: newDoc._id.split('.').pop() || '',
        _type: 'reference' as const,
        _strengthenOnPublish: {
          type: newDoc._type,
        },
        _weak: true,
      },
    }

    // If we have metadata, patch it. If not, create a new one
    if (metadata?._id) {
      await patchMetadataTranslations(translateClient, metadata._id, newRef)
    } else {
      // Create new metadata document with original document and translation
      console.log('Creating new metadata document with original document and translation')
      await createMetadataDocument(translateClient, document._id as string, newRef, fromLanguage.id)
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

  // First, check if a metadata document exists
  let metadata = await client.fetch(
    `*[_type == "translation.metadata" && references($documentId)][0]`,
    {documentId: document._id.split('.').pop()},
  )

  // Process translations sequentially to avoid race conditions
  const results: TranslationResult[] = []
  for (const language of targetLanguages) {
    // Skip if translation already exists
    if (hasTranslation(metadata, language.id)) {
      console.log(`Translation to ${language.id} already exists, skipping`)
      results.push({success: true, language, skipped: true})
      continue
    }

    const result = await translateToLanguage(
      document,
      translateClient,
      fromLanguage,
      language,
      metadata,
    )

    // If translation was successful, fetch the updated metadata document
    if (result.success) {
      metadata = await client.fetch(
        `*[_type == "translation.metadata" && references($documentId)][0]`,
        {documentId: document._id.split('.').pop()},
      )
    }

    results.push(result)
  }

  const successful = results.filter((r) => r.success && !r.skipped).length
  const skipped = results.filter((r) => r.skipped).length
  const failed = results.filter((r) => !r.success).length

  console.log(
    `Translation complete: ${successful} successful, ${skipped} skipped, ${failed} failed`,
  )
}
