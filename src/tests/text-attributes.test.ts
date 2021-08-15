import { mapNativeEmojis } from '../text-attributes'

const cases = [
  {
    text:
      ':+1::thumbsup::skin-tone-2::+1::skin-tone-3::+1::skin-tone-4::+1::skin-tone-5::+1::skin-tone-6:    :skin-tone-2:',
    result: '👍👍🏻👍🏼👍🏽👍🏾👍🏿    🏻',
  },
]
test('mapNativeEmojis', async () => {
  for (const c of cases) {
    const result = mapNativeEmojis(c.text)
    expect(result).toEqual(c.result)
  }
})
