import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StepPortsField } from '../src/client/ui/Inspector.tsx'
import { StepCardPorts } from '../src/client/ui/StepCard.tsx'
import { linkAllowedByPorts, portTypesCompatible } from '../src/shared/linkRules.ts'
import type { NodeData, NodePorts } from '../src/shared/types.ts'

describe('linkRules specification (卡 F2: 端口兼容连线规则 + 显示)', () => {
  describe('portTypesCompatible 纯函数规则', () => {
    describe('类型相等', () => {
      it('完全相同类型返回 true', () => {
        expect(portTypesCompatible('file', 'file')).toBe(true)
        expect(portTypesCompatible('string', 'string')).toBe(true)
        expect(portTypesCompatible('fastq', 'fastq')).toBe(true)
        expect(portTypesCompatible('bio.bam', 'bio.bam')).toBe(true)
      })

      it('忽略首尾空白字符后相等返回 true', () => {
        expect(portTypesCompatible(' fastq ', 'fastq')).toBe(true)
        expect(portTypesCompatible('file', ' file\t')).toBe(true)
      })

      it('空字符串或非字符串类型返回 false', () => {
        expect(portTypesCompatible('', '')).toBe(false)
        expect(portTypesCompatible('   ', '   ')).toBe(false)
        expect(portTypesCompatible('', 'file')).toBe(false)
        expect(portTypesCompatible('file', '')).toBe(false)
        // @ts-expect-error test invalid types
        expect(portTypesCompatible(null, 'file')).toBe(false)
        // @ts-expect-error test invalid types
        expect(portTypesCompatible('file', undefined)).toBe(false)
      })
    })

    describe('子类型兼容 (subtype)', () => {
      const bioSubtypes: Record<string, string[]> = {
        file: ['fastq', 'bam', 'sam', 'vcf'],
        table: ['csv', 'tsv'],
      }

      it('直接子类型匹配为 true (super -> subs)', () => {
        expect(portTypesCompatible('fastq', 'file', bioSubtypes)).toBe(true)
        expect(portTypesCompatible('file', 'fastq', bioSubtypes)).toBe(true)
        expect(portTypesCompatible('bam', 'file', bioSubtypes)).toBe(true)
        expect(portTypesCompatible('csv', 'table', bioSubtypes)).toBe(true)
      })

      it('多层传递子类型匹配为 true', () => {
        const nestedSubtypes: Record<string, string[]> = {
          file: ['sequence_file'],
          sequence_file: ['fastq', 'fasta'],
        }
        expect(portTypesCompatible('fastq', 'file', nestedSubtypes)).toBe(true)
        expect(portTypesCompatible('fasta', 'file', nestedSubtypes)).toBe(true)
      })

      it('反向映射格式 (sub -> supers) 也兼容', () => {
        const reverseSubtypes: Record<string, string[]> = {
          fastq: ['file'],
          bam: ['file'],
        }
        expect(portTypesCompatible('fastq', 'file', reverseSubtypes)).toBe(true)
        expect(portTypesCompatible('file', 'bam', reverseSubtypes)).toBe(true)
      })
    })

    describe('未知类型与不兼容类型 (未知不猜)', () => {
      const bioSubtypes: Record<string, string[]> = {
        file: ['fastq', 'bam'],
      }

      it('同级兄弟类型之间互不兼容', () => {
        // fastq 和 bam 都是 file 的子类，但彼此之间不兼容
        expect(portTypesCompatible('fastq', 'bam', bioSubtypes)).toBe(false)
      })

      it('未在词表中声明的未知类型返回 false，不随意猜测', () => {
        expect(portTypesCompatible('unknown_bio_type', 'file', bioSubtypes)).toBe(false)
        expect(portTypesCompatible('custom_format', 'another_format', bioSubtypes)).toBe(false)
      })

      it('未传入 subtypes 词表时，不同类型不匹配', () => {
        expect(portTypesCompatible('fastq', 'file')).toBe(false)
        expect(portTypesCompatible('string', 'number')).toBe(false)
      })
    })
  })

  describe('linkAllowedByPorts 节点间端口连线许可判定', () => {
    describe('单端无 ports 放行 (兼容旧图)', () => {
      it('两端均无 ports 时返回 true', () => {
        const source: NodeData = { prompt: 'echo old source' }
        const target: NodeData = { prompt: 'echo old target' }
        expect(linkAllowedByPorts(source, target)).toBe(true)
      })

      it('source 无 ports、target 有 ports 时返回 true', () => {
        const source: NodeData = { prompt: 'legacy tool' }
        const target: NodeData = {
          ports: {
            inputs: [{ name: 'in1', type: 'file' }],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(true)
      })

      it('source 有 ports、target 无 ports 时返回 true', () => {
        const source: NodeData = {
          ports: {
            outputs: [{ name: 'out1', type: 'file' }],
          },
        }
        const target: NodeData = { prompt: 'legacy consumer' }
        expect(linkAllowedByPorts(source, target)).toBe(true)
      })

      it('两端 ports 为 undefined 时返回 true', () => {
        expect(linkAllowedByPorts({}, {})).toBe(true)
      })
    })

    describe('方向为空时拒绝 (source 无 outputs / target 无 inputs)', () => {
      it('source 声明了 ports 但 outputs 为空数组时拒绝 (false)', () => {
        const source: NodeData = {
          ports: {
            inputs: [{ name: 'in', type: 'file' }],
            outputs: [],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [{ name: 'in', type: 'file' }],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(false)
      })

      it('source 声明了 ports 但未写 outputs 字段时拒绝 (false)', () => {
        const source: NodeData = {
          ports: {
            inputs: [{ name: 'in', type: 'file' }],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [{ name: 'in', type: 'file' }],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(false)
      })

      it('target 声明了 ports 但 inputs 为空数组时拒绝 (false)', () => {
        const source: NodeData = {
          ports: {
            outputs: [{ name: 'out', type: 'file' }],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [],
            outputs: [{ name: 'out', type: 'file' }],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(false)
      })

      it('target 声明了 ports 但未写 inputs 字段时拒绝 (false)', () => {
        const source: NodeData = {
          ports: {
            outputs: [{ name: 'out', type: 'file' }],
          },
        }
        const target: NodeData = {
          ports: {
            outputs: [{ name: 'out', type: 'file' }],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(false)
      })

      it('两端对应方向皆为空时拒绝 (false)', () => {
        const source: NodeData = { ports: { outputs: [] } }
        const target: NodeData = { ports: { inputs: [] } }
        expect(linkAllowedByPorts(source, target)).toBe(false)
      })
    })

    describe('双端有 ports 无兼容口拒绝', () => {
      it('完全无交集类型拒绝 (false)', () => {
        const source: NodeData = {
          ports: {
            outputs: [{ name: 'json_out', type: 'json' }],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [{ name: 'fastq_in', type: 'fastq' }],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(false)
      })

      it('在给定子类型体系下不兼容也拒绝 (false)', () => {
        const subtypes = { file: ['fastq', 'bam'] }
        const source: NodeData = {
          ports: {
            outputs: [{ name: 'bam_out', type: 'bam' }],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [{ name: 'fastq_in', type: 'fastq' }],
          },
        }
        expect(linkAllowedByPorts(source, target, subtypes)).toBe(false)
      })
    })

    describe('多口取交集 (multiple ports intersection)', () => {
      it('多输出与多输入中存在至少一对类型相等时放行 (true)', () => {
        const source: NodeData = {
          ports: {
            outputs: [
              { name: 'vcf_res', type: 'vcf' },
              { name: 'report', type: 'pdf' },
              { name: 'clean_fastq', type: 'fastq' },
            ],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [
              { name: 'ref_genome', type: 'fasta' },
              { name: 'raw_reads', type: 'fastq' },
            ],
          },
        }
        // clean_fastq 与 raw_reads 类型均为 fastq
        expect(linkAllowedByPorts(source, target)).toBe(true)
      })

      it('多口中仅通过子类型匹配时放行 (true)', () => {
        const subtypes = { file: ['fastq'] }
        const source: NodeData = {
          ports: {
            outputs: [
              { name: 'log', type: 'log_file' },
              { name: 'reads', type: 'fastq' },
            ],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [
              { name: 'generic_input', type: 'file' },
              { name: 'config', type: 'json' },
            ],
          },
        }
        expect(linkAllowedByPorts(source, target, subtypes)).toBe(true)
      })

      it('多口中无任何交集时拒绝 (false)', () => {
        const source: NodeData = {
          ports: {
            outputs: [
              { name: 'o1', type: 'typeA' },
              { name: 'o2', type: 'typeB' },
            ],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [
              { name: 'i1', type: 'typeC' },
              { name: 'i2', type: 'typeD' },
            ],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(false)
      })

      it('不按顺序或数量猜测绑定，仅判定是否存在可连端口对', () => {
        // source outputs: [B, A], target inputs: [A, C]
        // 即使位置错开，也能正确发现 A 与 A 匹配
        const source: NodeData = {
          ports: {
            outputs: [
              { name: 'outB', type: 'typeB' },
              { name: 'outA', type: 'typeA' },
            ],
          },
        }
        const target: NodeData = {
          ports: {
            inputs: [
              { name: 'inA', type: 'typeA' },
              { name: 'inC', type: 'typeC' },
            ],
          },
        }
        expect(linkAllowedByPorts(source, target)).toBe(true)
      })
    })
  })

  describe('UI 组件显示与老节点兼容 (StepCard / Inspector)', () => {
    describe('StepCardPorts (StepCard 紧凑端口展示)', () => {
      it('无 ports 时不渲染任何区块 (null)', () => {
        const html = renderToStaticMarkup(React.createElement(StepCardPorts))
        expect(html).toBe('')

        const htmlEmpty = renderToStaticMarkup(React.createElement(StepCardPorts, { ports: {} }))
        expect(htmlEmpty).toBe('')

        const htmlNoPorts = renderToStaticMarkup(
          React.createElement(StepCardPorts, { ports: { inputs: [], outputs: [] } }),
        )
        expect(htmlNoPorts).toBe('')
      })

      it('有 ports 时紧凑渲染输入/输出端口（名称 + 类型 + required 标记）', () => {
        const ports: NodePorts = {
          inputs: [
            { name: 'reads', type: 'fastq', required: true, description: '测序输入' },
            { name: 'ref', type: 'fasta', required: false },
          ],
          outputs: [{ name: 'bam_out', type: 'bam', required: true }],
        }
        const html = renderToStaticMarkup(React.createElement(StepCardPorts, { ports }))
        expect(html).toContain('wl-step-card-ports')
        expect(html).toContain('reads')
        expect(html).toContain('fastq')
        expect(html).toContain('ref')
        expect(html).toContain('fasta')
        expect(html).toContain('bam_out')
        expect(html).toContain('bam')
        expect(html).toContain('wl-port-req')
        expect(html).toContain('*')
        expect(html).toContain('输入')
        expect(html).toContain('输出')
      })
    })

    describe('StepPortsField (Inspector 属性面板端口区块)', () => {
      it('无 ports 时不渲染新区块 (null)', () => {
        const html = renderToStaticMarkup(React.createElement(StepPortsField))
        expect(html).toBe('')

        const htmlEmpty = renderToStaticMarkup(React.createElement(StepPortsField, { ports: {} }))
        expect(htmlEmpty).toBe('')

        const htmlNoPorts = renderToStaticMarkup(
          React.createElement(StepPortsField, { ports: { inputs: [], outputs: [] } }),
        )
        expect(htmlNoPorts).toBe('')
      })

      it('有 ports 时渲染端口标题、总计数、输入输出清单及必填标记', () => {
        const ports: NodePorts = {
          inputs: [{ name: 'sample_fq', type: 'fastq', required: true }],
          outputs: [
            { name: 'aligned_bam', type: 'bam', required: false },
            { name: 'stat_json', type: 'json', required: true },
          ],
        }
        const html = renderToStaticMarkup(React.createElement(StepPortsField, { ports }))
        expect(html).toContain('wl-step-ports')
        expect(html).toContain('端口')
        // 总端口计数为 3
        expect(html).toContain('>3<')
        expect(html).toContain('sample_fq')
        expect(html).toContain('fastq')
        expect(html).toContain('aligned_bam')
        expect(html).toContain('bam')
        expect(html).toContain('stat_json')
        expect(html).toContain('json')
        expect(html).toContain('wl-port-req')
      })
    })
  })
})

