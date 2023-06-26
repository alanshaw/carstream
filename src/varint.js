const MSB = 0x80
const REST = 0x7F
const MSBALL = ~REST
const INT = Math.pow(2, 31)

/**
 * @param {number} num
 */
export const encode = num => {
  /** @type {number[]} */
  const out = []
  let offset = 0

  while (num >= INT) {
    out[offset++] = (num & 0xFF) | MSB
    num /= 128
  }
  while (num & MSBALL) {
    out[offset++] = (num & 0xFF) | MSB
    num >>>= 7
  }
  out[offset] = num | 0

  return out
}

/**
 * @param {import('uint8arraylist').Uint8ArrayList} buf
 * @param {number} [offset]
 */
export const decode = (buf, offset) => {
  let res = 0
  offset = offset || 0
  let shift = 0
  let counter = offset
  let b
  const l = buf.length

  do {
    if (counter >= l || shift > 49) throw new RangeError('Could not decode varint')
    b = buf.get(counter++)
    res += shift < 28
      ? (b & REST) << shift
      : (b & REST) * Math.pow(2, shift)
    shift += 7
  } while (b >= MSB)

  return [res, counter - offset]
}
