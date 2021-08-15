import { mapNativeEmojis } from '../text-attributes'

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
