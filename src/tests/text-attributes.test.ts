import { emojisToCode, mapNativeEmojis } from '../text-attributes'

test('mapNativeEmojis', async () => {
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

test('emojisToCode', async () => {
  const cases = [
    {
      text: '👍👍🏼',
      result: ':thumbsup::thumbsup::skin-tone-3:',
    },
  ]

  for (const c of cases) {
    const result = emojisToCode(c.text)
    expect(result).toEqual(c.result)
  }
})
