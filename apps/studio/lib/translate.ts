import type {SanityClient, SanityDocument} from 'sanity'
import {supportedLanguages} from '../sanity.config'
import {token, projectId, dataset} from '../env'
import {createClient} from '@sanity/client'

type TranslationResult = {
  success: boolean
  language: {id: string; title: string}
  error?: unknown
  skipped?: boolean
}

export const client = createClient({projectId, dataset, apiVersion: 'vX', useCdn: false, token})

// Simple semaphore implementation for rate limiting
class Semaphore {
  private permits: number
  private queue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => this.queue.push(resolve))
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) next()
    } else {
      this.permits++
    }
  }
}

// Create a semaphore with desired concurrency limit
const translationSemaphore = new Semaphore(5) // Adjust this number based on your API limits

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
      ],
    }
    const result = await client.create(metadataDoc)
    console.log('Successfully created metadata document with original document')
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
  fromLanguage: {id: string; title: string},
  language: {id: string; title: string},
  metadata: any,
): Promise<TranslationResult> => {
  console.log('Translating to', language)
  try {
    const newDoc = await client.agent.action.translate({
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

    // Always patch the metadata document - it should exist at this point
    await patchMetadataTranslations(client, metadata._id, newRef)

    console.log('Translated to', language, newDoc)
    return {success: true, language}
  } catch (e) {
    console.error('Error translating to', language, e)
    return {success: false, language, error: e}
  }
}

export const translate = async (document: SanityDocument) => {
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

  // Create initial metadata document if it doesn't exist
  if (!metadata?._id) {
    metadata = await createMetadataDocument(
      client,
      document._id as string,
      {
        _key: fromLanguage.id,
        _type: 'internationalizedArrayReferenceValue',
        value: {
          _ref: document._id.split('.').pop() || '',
          _type: 'reference',
        },
      },
      fromLanguage.id,
    )
  }

  // Process translations with rate limiting
  const results: TranslationResult[] = await Promise.all(
    targetLanguages.map(async (language) => {
      // Skip if translation already exists
      if (hasTranslation(metadata, language.id)) {
        console.log(`Translation to ${language.id} already exists, skipping`)
        return {success: true, language, skipped: true}
      }

      // Acquire semaphore before translation
      await translationSemaphore.acquire()
      try {
        const result = await translateToLanguage(document, fromLanguage, language, metadata)
        return result
      } finally {
        // Always release the semaphore, even if translation fails
        translationSemaphore.release()
      }
    }),
  )

  // After all translations are complete, fetch the final metadata state
  metadata = await client.fetch(
    `*[_type == "translation.metadata" && references($documentId)][0]`,
    {documentId: document._id.split('.').pop()},
  )

  const successful = results.filter((r) => r.success && !r.skipped).length
  const skipped = results.filter((r) => r.skipped).length
  const failed = results.filter((r) => !r.success).length

  console.log(
    `Translation complete: ${successful} successful, ${skipped} skipped, ${failed} failed`,
  )
}
