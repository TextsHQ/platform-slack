import { mapNativeEmojis, mapTextAttributes } from '../text-attributes'

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
  ]
  for (const c of cases) {
    const result = mapTextAttributes(c.src)
    expect(result).toEqual(c.result)
  }
})
