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

/** @extends {TransformStream<Uint8Array, import('./api.js').Block & import('./api.js').Position>} */
export class CARReaderStream extends TransformStream {
  /** @type {Promise<import('./api.js').CARHeader>} */
  #headerPromise

  /**
   * @param {QueuingStrategy<Uint8Array>} [writableStrategy]
   * An object that optionally defines a queuing strategy for the stream.
   * @param {QueuingStrategy<import('./api.js').Block & import('./api.js').Position>} [readableStrategy]
   * An object that optionally defines a queuing strategy for the stream.
   * Defaults to a CountQueuingStrategy with highWaterMark of `1` to allow
   * `getHeader` to be called before the stream is consumed.
   */
  constructor (writableStrategy, readableStrategy) {
    const buffer = new Uint8ArrayList()
    let offset = 0
    let prevOffset = offset
    let wanted = 8
    let state = State.ReadHeaderLength

    /** @type {(value: import('./api.js').CARHeader) => void} */
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
            prevOffset = offset
            offset += bytes
            state = State.ReadHeader
            wanted = length
          } else if (state === State.ReadHeader) {
            const header = decodeDagCBOR(buffer.slice(0, wanted))
            resolveHeader && resolveHeader(header)
            buffer.consume(wanted)
            prevOffset = offset
            offset += wanted
            state = State.ReadBlockLength
            wanted = 8
          } else if (state === State.ReadBlockLength) {
            const [length, bytes] = decodeVarint(buffer)
            buffer.consume(bytes)
            prevOffset = offset
            offset += bytes
            state = State.ReadBlock
            wanted = length
          } else if (state === State.ReadBlock) {
            const _offset = prevOffset
            const length = offset - prevOffset + wanted

            prevOffset = offset
            /** @type {import('multiformats').UnknownLink} */
            let cid
            if (buffer.get(0) === CIDV0_BYTES.SHA2_256 && buffer.get(1) === CIDV0_BYTES.LENGTH) {
              const bytes = buffer.subarray(0, 34)
              const multihash = decodeDigest(bytes)
              // @ts-expect-error
              cid = createLegacyLink(multihash)
              buffer.consume(34)
              offset += 34
            } else {
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
            }

            const blockBytes = wanted - (offset - prevOffset)
            const bytes = buffer.subarray(0, blockBytes)
            controller.enqueue({ cid, bytes, offset: _offset, length, blockOffset: offset, blockLength: blockBytes })

            buffer.consume(blockBytes)
            prevOffset = offset
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
    }, writableStrategy, readableStrategy ?? new CountQueuingStrategy({ highWaterMark: 1 }))

    this.#headerPromise = headerPromise
  }

  /**
   * Get the decoded CAR header.
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
