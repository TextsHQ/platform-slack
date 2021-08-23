import type { TextAttributes } from '../../../platform-sdk/dist'
import {
  Block,
  mapBlocks,
  mapNativeEmojis,
  mapTextAttributes,
} from '../text-attributes'

test('mapNativeEmojis', () => {
  const cases = [
    {
      text:
        ':+1::thumbsup::skin-tone-2::+1::skin-tone-3::+1::skin-tone-4::+1::skin-tone-5::+1::skin-tone-6:    :skin-tone-2:',
      result: '👍👍🏻👍🏼👍🏽👍🏾👍🏿    🏻',
    },
  ]

  for (const c of cases) {
    const result = mapNativeEmojis(c.text)
    expect(result).toEqual(c.result)
  }
})

test('mapTextAttributes', () => {
  const cases = [
    {
      src:
        '✌️ <https://twitter.com/jack|@jack> <http://Texts.com|Texts.com> Me too :wink:',
      result: {
        text: '✌️ @jack Texts.com Me too 😉',
        textAttributes: {
          entities: [
            {
              from: 3,
              to: 8,
              link: 'https://twitter.com/jack',
            },
            {
              from: 9,
              to: 18,
              link: 'http://Texts.com',
            },
          ],
          heDecode: true,
        },
      },
    },
    {
      src:
        'You asked me to remind you “:thumbsup: hi &lt;<https://twitter.com>|test&gt; 123”.',
      result: {
        text:
          'You asked me to remind you “👍 hi &lt;https://twitter.com|test&gt; 123”.',
        textAttributes: {
          entities: [
            {
              from: 37,
              to: 56,
              link: 'https://twitter.com',
            },
          ],
          heDecode: true,
        },
      },
    },
    {
      src:
        '*<https://github.com/TextsHQ/texts-app-desktop/compare/5e502f5a47ee...0050c68aabd6|1 new commit> pushed  to `<https://github.com/TextsHQ/texts-app-desktop/tree/main|main>` by KishanBagaria*',
      wrapInQuote: true,
      result: {
        text: '1 new commit pushed  to main by KishanBagaria',
        textAttributes: {
          entities: [
            {
              from: 0,
              to: 12,
              link:
                'https://github.com/TextsHQ/texts-app-desktop/compare/5e502f5a47ee...0050c68aabd6',
            },
            {
              from: 24,
              to: 28,
              link: 'https://github.com/TextsHQ/texts-app-desktop/tree/main',
            },
            {
              from: 24,
              to: 28,
              code: true,
            },
            {
              from: 0,
              to: 45,
              bold: true,
            },
            {
              from: 0,
              to: 45,
              quote: true,
            },
          ],
          heDecode: true,
        },
      },
    },
  ]
  for (const c of cases) {
    const result = mapTextAttributes(c.src, c.wrapInQuote)
    expect(result).toEqual(c.result)
  }
})

test.only('mapBlocks', () => {
  type Case = {
    blocks: Block[]
    result: {
      text: string,
      textAttributes: TextAttributes
    }
  }
  const cases: Case[] = [
    {
      blocks: [
        {
          type: 'rich_text',
          elements: [
            {
              type: 'rich_text_quote',
              elements: [
                {
                  type: 'text',
                  text:
                    'WhatsApp is launching a public beta program\n\n',
                },
                {
                  type: 'link',
                  url:
                    'https://wabetainfo.com/whatsapp/',
                },
              ],
            },
            {
              type: 'rich_text_section',
              elements: [],
            },
          ],
        },
      ],
      result: {
        text: 'WhatsApp is launching a public beta program\n\nhttps://wabetainfo.com/whatsapp/',
        textAttributes: {
          entities: [],
          heDecode: true
        }
      }
    },
  ]
  for (const c of cases) {
    const result = mapBlocks(c.blocks)
    expect(result).toEqual(c.result)
  }
})
