/**
 * Remove characters right before and after a given substring
 *
 * @param text
 * @param substring
 */
export const removeCharactersAfterAndBefore = (text: string, substring: string): string => {
  try {
    let index = text.indexOf(substring)
    let editedText: string[] | string = text.split('')
    editedText.splice(index - 1, 1)
    editedText = editedText.join('')

    index = editedText.indexOf(substring)
    editedText = editedText.split('')
    editedText.splice(index + substring.length, 1)

    return editedText.join('')
  } catch {
    return text
  }
}
