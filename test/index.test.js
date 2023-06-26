/* eslint-env browser */
import fs from 'node:fs'
import { Readable } from 'node:stream'
import * as raw from 'multiformats/codecs/raw'
import * as dagCBOR from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import { equals } from 'multiformats/bytes'
import { CarIndexer } from '@ipld/car'
import { Map as LinkMap } from 'lnmap'
import { CARWriterStream, CARReaderStream } from '../src/index.js'

const fixture = 'test/fixtures/bafybeicpxveeln3sd4scqlacrunxhzmvslnbgxa72evmqg7r27emdek464.car'

/** @type {Record<string, import('entail').Test>} */
export const test = {
  'should round trip': async assert => {
    const leaf = await Block.encode({ value: new Uint8Array(), codec: raw, hasher })
    const root = await Block.encode({ value: { leaf: leaf.cid }, codec: dagCBOR, hasher })

    const srcBlocks = [leaf, root]
    const readable = new ReadableStream({
      pull (controller) {
        const block = srcBlocks.shift()
        if (!block) return controller.close()
        controller.enqueue(block)
      }
    })

    const destBlocks = []
    await readable
      .pipeThrough(new CARWriterStream([root.cid]))
      .pipeThrough(new CARReaderStream())
      .pipeTo(new WritableStream({ write: block => { destBlocks.push(block) } }))

    assert.equal(destBlocks.length, 2)
    assert.equal(destBlocks[0].cid.toString(), leaf.cid.toString())
    assert.ok(equals(destBlocks[0].bytes, leaf.bytes))
    assert.equal(destBlocks[1].cid.toString(), root.cid.toString())
    assert.ok(equals(destBlocks[1].bytes, root.bytes))
  },

  'should produce correct positions': async assert => {
    const offsets = new LinkMap()
    const lengths = new LinkMap()
    const indexer = await CarIndexer.fromIterable(fs.createReadStream(fixture))
    for await (const { cid, offset, length } of indexer) {
      offsets.set(cid, offset)
      lengths.set(cid, length)
    }

    await Readable.toWeb(fs.createReadStream(fixture))
      // @ts-expect-error
      .pipeThrough(new CARReaderStream())
      .pipeTo(new WritableStream({
        write (block) {
          // @ts-expect-error
          assert.equal(block.offset, offsets.get(block.cid), 'offset should be equal')
          // @ts-expect-error
          assert.equal(block.length, lengths.get(block.cid), 'length should be equal')
        }
      }))
  }
}
