/* eslint-env browser */
import { encode as encodeCBOR } from '@ipld/dag-cbor'
import { encode as encodeVarint } from './varint.js'

/**
 * @param {import('multiformats').UnknownLink[]} roots
 * @returns {Uint8Array}
 */
export const encodeHeader = roots => {
  const headerBytes = encodeCBOR({ version: 1, roots })
  const varintBytes = encodeVarint(headerBytes.length)
  const header = new Uint8Array(varintBytes.length + headerBytes.length)
  header.set(varintBytes, 0)
  header.set(headerBytes, varintBytes.length)
  return header
}

/**
 * @param {import('./api.js').Block} block
 * @returns {Uint8Array}
 */
export const encodeBlock = block => {
  const varintBytes = encodeVarint(block.cid.bytes.length + block.bytes.length)
  const bytes = new Uint8Array(varintBytes.length + block.cid.bytes.length + block.bytes.length)
  bytes.set(varintBytes)
  bytes.set(block.cid.bytes, varintBytes.length)
  bytes.set(block.bytes, varintBytes.length + block.cid.bytes.length)
  return bytes
}

/** @extends {TransformStream<import('./api.js').Block, Uint8Array>} */
export class CARWriterStream extends TransformStream {
  /**
   * @param {import('multiformats').UnknownLink[]} [roots]
   * @param {QueuingStrategy<import('./api.js').Block>} [writableStrategy]
   * @param {QueuingStrategy<Uint8Array>} [readableStrategy]
   */
  constructor (roots = [], writableStrategy, readableStrategy) {
    super({
      start: controller => controller.enqueue(encodeHeader(roots)),
      transform: (block, controller) => controller.enqueue(encodeBlock(block))
    }, writableStrategy, readableStrategy)
  }
}
