/***
 This is part of jsdifflib v1.0. <http://snowtide.com/jsdifflib>

 Copyright (c) 2007, Snowtide Informatics Systems, Inc.
 All rights reserved.

 Redistribution and use in source and binary forms, with or without modification,
 are permitted provided that the following conditions are met:

 * Redistributions of source code must retain the above copyright notice, this
 list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice,
 this list of conditions and the following disclaimer in the documentation
 and/or other materials provided with the distribution.
 * Neither the name of the Snowtide Informatics Systems nor the names of its
 contributors may be used to endorse or promote products derived from this
 software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
 BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
 DAMAGE.
 ***/
/* Author: Chas Emerick <cemerick@snowtide.com> */
const WHITESPACE = {
  ' ': true,
  '\t': true,
  '\n': true,
  '\f': true,
  '\r': true
}

const difflib = {
  defaultJunkFunction: function (c) {
    return WHITESPACE.hasOwnProperty(c)
  },

  stripLinebreaks: function (str) {
    return str.replace(/^[\n\r]*|[\n\r]*$/g, '')
  },

  stringAsLines: function (str) {
    const lfpos = str.indexOf('\n')
    const crpos = str.indexOf('\r')
    const linebreak = ((lfpos > -1 && crpos > -1) || crpos < 0) ? '\n' : '\r'

    const lines = str.split(linebreak)
    for (let i = 0; i < lines.length; i++) {
      lines[i] = difflib.stripLinebreaks(lines[i])
    }

    return lines
  },

  // iteration-based reduce implementation
  _reduce: function (func, list, initial) {
    let value
    let idx

    if (initial != null) {
      value = initial
      idx = 0
    } else if (list) {
      value = list[0]
      idx = 1
    } else {
      return null
    }

    for (; idx < list.length; idx++) {
      value = func(value, list[idx])
    }

    return value
  },

  // comparison function for sorting lists of numeric tuples
  _numericTuplesCompare: function (a, b) {
    const len = Math.max(a.length, b.length)

    for (let i = 0; i < len; i++) {
      if (a[i] < b[i]) {
        return -1
      }
      if (a[i] > b[i]) {
        return 1
      }
    }

    return a.length === b.length ? 0 : (a.length < b.length ? -1 : 1)
  },

  _calculateRatio: function (matches, length) {
    return length ? 2.0 * matches / length : 1.0
  },

  // returns a function that returns true if a key passed to the returned function
  // is in the dict (js object) provided to this function; replaces being able to
  // carry around dict.has_key in python...
  _isIndict: function (dict) {
    return function (key) {
      return dict.hasOwnProperty(key)
    }
  },

  // replacement for python's dict.get function -- need easy default values
  _dictGet: function (dict, key, defaultValue) {
    return dict.hasOwnProperty(key) ? dict[key] : defaultValue
  },

  SequenceMatcher: function (a, b, isJunk) {
    this.setSequences = function (a, b) {
      this.setBaseSequence(a)
      this.setNewSequence(b)
    }

    this.setBaseSequence = function (a) {
      if (a === this.baseLines) {
        return
      }
      this.baseLines = a
      this.matchingBlocks = this.opcodes = null
    }

    this.setNewSequence = function (b) {
      if (b === this.newLines) {
        return
      }
      this.newLines = b
      this.matchingBlocks = this.opcodes = this.fullBlocksCount = null
      this._chainBlocks()
    }

    this._chainBlocks = function () {
      const b = this.newLines
      const n = b.length
      const b2j = this.newLines2Junks = {}
      const popularDict = {}

      for (let i = 0; i < b.length; i++) {
        let elt = b[i]

        if (b2j.hasOwnProperty(elt)) {
          let indices = b2j[elt]
          if (n >= 200 && indices.length * 100 > n) {
            popularDict[elt] = 1
            delete b2j[elt]
          } else {
            indices.push(i)
          }
        } else {
          b2j[elt] = [i]
        }
      }

      for (let elt in popularDict) {
        if (popularDict.hasOwnProperty(elt)) {
          delete b2j[elt]
        }
      }

      const isJunk = this.isJunk
      const junkDict = {}

      if (isJunk) {
        for (let elt in popularDict) {
          if (popularDict.hasOwnProperty(elt) && isJunk(elt)) {
            junkDict[elt] = 1
            delete popularDict[elt]
          }
        }
        for (let elt in b2j) {
          if (b2j.hasOwnProperty(elt) && isJunk(elt)) {
            junkDict[elt] = 1
            delete b2j[elt]
          }
        }
      }

      this.isBlockJunk = difflib._isIndict(junkDict)
      this.isBlockPopular = difflib._isIndict(popularDict)
    }

    this.findLongestMatch = function (alo, ahi, blo, bhi) {
      const a = this.baseLines
      const b = this.newLines
      const b2j = this.newLines2Junks
      const isBlockJunk = this.isBlockJunk
      let besti = alo
      let bestj = blo
      let bestsize = 0
      let j = null
      let k

      let j2len = {}
      const nothing = []

      for (let i = alo; i < ahi; i++) {
        let newj2len = {}
        let jdict = difflib._dictGet(b2j, a[i], nothing)

        for (let jkey in jdict) {
          if (jdict.hasOwnProperty(jkey)) {
            j = jdict[jkey]
            if (j < blo) {
              continue
            }
            if (j >= bhi) {
              break
            }
            newj2len[j] = k = difflib._dictGet(j2len, j - 1, 0) + 1
            if (k > bestsize) {
              besti = i - k + 1
              bestj = j - k + 1
              bestsize = k
            }
          }
        }
        j2len = newj2len
      }

      while (besti > alo && bestj > blo && !isBlockJunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
        besti--
        bestj--
        bestsize++
      }

      while (besti + bestsize < ahi && bestj + bestsize < bhi &&
      !isBlockJunk(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]) {
        bestsize++
      }

      while (besti > alo && bestj > blo && isBlockJunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
        besti--
        bestj--
        bestsize++
      }

      while (besti + bestsize < ahi && bestj + bestsize < bhi && isBlockJunk(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]) {
        bestsize++
      }

      return [
        besti,
        bestj,
        bestsize
      ]
    }

    this.getMatchingBlocks = function () {
      if (this.matchingBlocks != null) {
        return this.matchingBlocks
      }

      const la = this.baseLines.length
      const lb = this.newLines.length

      const queue = [
        [
          0,
          la,
          0,
          lb
        ]
      ]
      const matchingBlocks = []
      let alo,
        ahi,
        blo,
        bhi,
        qi,
        i,
        j,
        k,
        x
      while (queue.length) {
        qi = queue.pop()
        alo = qi[0]
        ahi = qi[1]
        blo = qi[2]
        bhi = qi[3]
        x = this.findLongestMatch(alo, ahi, blo, bhi)
        i = x[0]
        j = x[1]
        k = x[2]

        if (k) {
          matchingBlocks.push(x)
          if (alo < i && blo < j) {
            queue.push([
              alo,
              i,
              blo,
              j
            ])
          }
          if (i + k < ahi && j + k < bhi) {
            queue.push([
              i + k,
              ahi,
              j + k,
              bhi
            ])
          }
        }
      }

      matchingBlocks.sort(difflib._numericTuplesCompare)

      let i1 = 0,
        j1 = 0,
        k1 = 0,
        block = 0
      let i2,
        j2,
        k2
      const non_adjacent = []
      for (let idx in matchingBlocks) {
        if (matchingBlocks.hasOwnProperty(idx)) {
          block = matchingBlocks[idx]
          i2 = block[0]
          j2 = block[1]
          k2 = block[2]
          if (i1 + k1 === i2 && j1 + k1 === j2) {
            k1 += k2
          } else {
            if (k1) {
              non_adjacent.push([
                i1,
                j1,
                k1
              ])
            }
            i1 = i2
            j1 = j2
            k1 = k2
          }
        }
      }

      if (k1) {
        non_adjacent.push([
          i1,
          j1,
          k1
        ])
      }

      non_adjacent.push([
        la,
        lb,
        0
      ])
      this.matchingBlocks = non_adjacent
      return this.matchingBlocks
    }

    this.getOpcodes = function () {
      if (this.opcodes != null) {
        return this.opcodes
      }
      let i = 0
      let j = 0
      const answer = []

      this.opcodes = answer

      let block,
        ai,
        bj,
        size,
        tag
      const blocks = this.getMatchingBlocks()
      for (let idx in blocks) {
        if (blocks.hasOwnProperty(idx)) {
          block = blocks[idx]
          ai = block[0]
          bj = block[1]
          size = block[2]
          tag = ''
          if (i < ai && j < bj) {
            tag = 'replace'
          } else if (i < ai) {
            tag = 'delete'
          } else if (j < bj) {
            tag = 'insert'
          }
          if (tag) {
            answer.push([
              tag,
              i,
              ai,
              j,
              bj
            ])
          }
          i = ai + size
          j = bj + size

          if (size) {
            answer.push([
              'equal',
              ai,
              i,
              bj,
              j
            ])
          }
        }
      }

      return answer
    }

    // this is a generator function in the python lib, which of course is not supported in javascript
    // the reimplementation builds up the grouped opcodes into a list in their entirety and returns that.
    this.getGroupedOpcodes = function (n) {
      if (!n) {
        n = 3
      }
      let codes = this.getOpcodes()
      if (!codes) {
        codes = [
          [
            'equal',
            0,
            1,
            0,
            1
          ]
        ]
      }
      let code,
        tag,
        i1,
        i2,
        j1,
        j2
      if (codes[0][0] === 'equal') {
        code = codes[0]
        tag = code[0]
        i1 = code[1]
        i2 = code[2]
        j1 = code[3]
        j2 = code[4]
        codes[0] = [
          tag,
          Math.max(i1, i2 - n),
          i2,
          Math.max(j1, j2 - n),
          j2
        ]
      }
      if (codes[codes.length - 1][0] === 'equal') {
        code = codes[codes.length - 1]
        tag = code[0]
        i1 = code[1]
        i2 = code[2]
        j1 = code[3]
        j2 = code[4]
        codes[codes.length - 1] = [
          tag,
          i1,
          Math.min(i2, i1 + n),
          j1,
          Math.min(j2, j1 + n)
        ]
      }

      const nn = n + n
      let group = []
      const groups = []
      for (let idx in codes) {
        if (codes.hasOwnProperty(idx)) {
          code = codes[idx]
          tag = code[0]
          i1 = code[1]
          i2 = code[2]
          j1 = code[3]
          j2 = code[4]
          if (tag === 'equal' && i2 - i1 > nn) {
            group.push([
              tag,
              i1,
              Math.min(i2, i1 + n),
              j1,
              Math.min(j2, j1 + n)
            ])
            groups.push(group)
            group = []
            i1 = Math.max(i1, i2 - n)
            j1 = Math.max(j1, j2 - n)
          }

          group.push([
            tag,
            i1,
            i2,
            j1,
            j2
          ])
        }
      }

      if (group && !(group.length === 1 && group[0][0] === 'equal')) {
        groups.push(group)
      }

      return groups
    }

    this.ratio = function () {
      const matches = difflib._reduce(
        function (sum, triple) {
          return sum + triple[triple.length - 1]
        },
        this.getMatchingBlocks(), 0)
      return difflib._calculateRatio(matches, this.baseLines.length + this.newLines.length)
    }

    this.quickRatio = function () {
      let fullBlocksCount
      let elt

      if (this.fullBlocksCount === null) {
        this.fullBlocksCount = fullBlocksCount = {}

        for (let i = 0; i < this.newLines.length; i++) {
          elt = this.newLines[i]
          fullBlocksCount[elt] = difflib._dictGet(fullBlocksCount, elt, 0) + 1
        }
      }

      fullBlocksCount = this.fullBlocksCount

      const avail = {}
      const availHas = difflib._isIndict(avail)
      let matches = 0
      let numb = 0

      for (let i = 0; i < this.baseLines.length; i++) {
        elt = this.baseLines[i]
        if (availHas(elt)) {
          numb = avail[elt]
        } else {
          numb = difflib._dictGet(fullBlocksCount, elt, 0)
        }
        avail[elt] = numb - 1
        if (numb > 0) {
          matches++
        }
      }

      return difflib._calculateRatio(matches, this.baseLines.length + this.newLines.length)
    }

    this.realQuickRatio = function () {
      const la = this.baseLines.length
      const lb = this.newLines.length
      return difflib._calculateRatio(Math.min(la, lb), la + lb)
    }

    this.getDiffLines = function (start, end, textLines, change) {
      const lines = []

      for (let i = start; i < end; i++) {
        lines.push({
          position: i + 1,
          subPieces: [],
          text: textLines[i],
          type: change
        })
      }

      return lines
    }

    this.getDiffModule = function (baseTextLines, newTextLines, opcodes) {
      const oldText = { lines: [] }
      const newText = { lines: [] }
      let change = ''

      opcodes.forEach((code) => {
        let baseStart = code[1]
        let baseEnd = code[2]
        let newStart = code[3]
        let newEnd = code[4]

        change = code[0]

        oldText.lines.push(...this.getDiffLines(baseStart, baseEnd, baseTextLines, change))
        newText.lines.push(...this.getDiffLines(newStart, newEnd, newTextLines, change))
      })

      return {
        oldText,
        newText
      }
    }

    this.isJunk = isJunk ? isJunk : difflib.defaultJunkFunction
    this.baseLines = this.newLines = null

    this.setSequences(a, b)
  }
}

module.exports = difflib
