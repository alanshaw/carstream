/* eslint-env browser */
import { Uint8ArrayList } from 'uint8arraylist'
import { decode as decodeDagCBOR } from '@ipld/dag-cbor'
import { decode as decodeDigest } from 'multiformats/hashes/digest'
import { create as createLink, createLegacy as createLegacyLink } from 'multiformats/link'
import { decode as decodeVarint } from './varint.js'

const State = {
  ReadHeaderLength: 0,
  ReadHeader: 1,
  ReadBlockLength: 2,
  ReadBlock: 3
}

const CIDV0_BYTES = {
  SHA2_256: 0x12,
  LENGTH: 0x20,
  DAG_PB: 0x70
}

/** @extends {TransformStream<Uint8Array, import('./api').Block & import('./api').Position>} */
export class CARReaderStream extends TransformStream {
  /** @type {Promise<import('./api').CARHeader>} */
  #headerPromise

  /**
   * @param {QueuingStrategy<Uint8Array>} [writableStrategy]
   * @param {QueuingStrategy<import('./api').Block & import('./api').Position>} [readableStrategy]
   */
  constructor (writableStrategy, readableStrategy) {
    const buffer = new Uint8ArrayList()
    let offset = 0
    let wanted = 8
    let state = State.ReadHeaderLength

    /** @type {(value: import('./api').CARHeader) => void} */
    let resolveHeader
    const headerPromise = new Promise(resolve => { resolveHeader = resolve })

    super({
      transform (chunk, controller) {
        buffer.append(chunk)
        while (true) {
          if (buffer.length < wanted) break
          if (state === State.ReadHeaderLength) {
            const [length, bytes] = decodeVarint(buffer)
            buffer.consume(bytes)
            offset += bytes
            state = State.ReadHeader
            wanted = length
          } else if (state === State.ReadHeader) {
            const header = decodeDagCBOR(buffer.slice(0, wanted))
            resolveHeader && resolveHeader(header)
            buffer.consume(wanted)
            offset += wanted
            state = State.ReadBlockLength
            wanted = 8
          } else if (state === State.ReadBlockLength) {
            const [length, bytes] = decodeVarint(buffer)
            buffer.consume(bytes)
            offset += bytes
            state = State.ReadBlock
            wanted = length
          } else if (state === State.ReadBlock) {
            const _offset = offset
            const length = wanted
            /** @type {import('multiformats').UnknownLink} */
            let cid
            if (buffer.get(0) === CIDV0_BYTES.SHA2_256 && buffer.get(1) === CIDV0_BYTES.LENGTH) {
              const bytes = buffer.subarray(0, 34)
              const multihash = decodeDigest(bytes)
              // @ts-expect-error
              cid = createLegacyLink(multihash)
              buffer.consume(34)
              offset += 34
            }

            const [version, versionBytes] = decodeVarint(buffer)
            if (version !== 1) throw new Error(`unexpected CID version (${version})`)
            buffer.consume(versionBytes)
            offset += versionBytes

            const [codec, codecBytes] = decodeVarint(buffer)
            buffer.consume(codecBytes)
            offset += codecBytes

            const multihashBytes = getMultihashLength(buffer)
            const multihash = decodeDigest(buffer.subarray(0, multihashBytes))
            cid = createLink(codec, multihash)
            buffer.consume(multihashBytes)
            offset += multihashBytes

            const blockBytes = wanted - (offset - _offset)
            const bytes = buffer.subarray(0, blockBytes)
            controller.enqueue({ cid, bytes, offset: _offset, length })

            buffer.consume(blockBytes)
            offset += blockBytes
            state = State.ReadBlockLength
            wanted = 8
          }
        }
      },
      flush (controller) {
        if (state !== State.ReadBlockLength) {
          controller.error(new Error('unexpected end of data'))
        }
      }
    }, writableStrategy, readableStrategy)

    this.#headerPromise = headerPromise
  }

  /**
   * Get the decoded CAR header. You must begin consuming from the stream to
   * resolve the promise.
   */
  getHeader () {
    return this.#headerPromise
  }
}

/** @param {Uint8ArrayList} bytes */
const getMultihashLength = bytes => {
  const [, codeBytes] = decodeVarint(bytes)
  const [length, lengthBytes] = decodeVarint(bytes, codeBytes)
  return codeBytes + lengthBytes + length
}
