import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  canonicalBindings,
  cloneNodeData,
  DATA_KEYS,
  normalizeNodeData,
  readBindings,
  readDocument,
  readNodeData,
  resolveEffectiveBindings,
  sameNodeData,
  writeDocument,
} from '../src/shared/model.ts'
import type { NodeData, NodePorts, StepNode, WorkflowDocument } from '../src/shared/types.ts'
import { checkBindings, validateDocument } from '../src/shared/validate.ts'
import { StepCardPorts } from '../src/client/ui/StepCard.tsx'
import { EdgePortsField, StepPortsField } from '../src/client/ui/Inspector.tsx'
import { isValidConnection } from '../src/shared/linkRules.ts'

function doc(partial: Partial<WorkflowDocument> = {}): WorkflowDocument {
  return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, ...partial }
}

describe('fork 具名端口绑定的编辑与持久化 (卡 F3)', () => {
  describe('数据模型与持久化保真 (readNodeData / writeDocument / DATA_KEYS)', () => {
    it('DATA_KEYS 数组中包含 "bindings"', () => {
      expect(DATA_KEYS).toContain('bindings')
    })

    it('readNodeData 完整保留 bindings 数据', () => {
      const raw = {
        prompt: 'run qc',
        ports: {
          inputs: [{ name: 'reads_file', type: 'fastq' }],
          outputs: [{ name: 'qc_json', type: 'json' }],
        },
        bindings: {
          reads_file: { node: 'upstream_step', port: 'raw_fastq' },
        },
      }
      const data = readNodeData(raw)
      expect(data.bindings).toBeDefined()
      expect(data.bindings?.reads_file).toEqual({
        node: 'upstream_step',
        port: 'raw_fastq',
      })
    })

    it('readNodeData 读入空 bindings {} 保持保真', () => {
      const raw = {
        prompt: 'test',
        bindings: {},
      }
      const data = readNodeData(raw)
      expect(data.bindings).toEqual({})
    })

    it('readNodeData 在未提供 bindings 时不产生多余字段，兼容老图', () => {
      const raw = { prompt: 'legacy node' }
      const data = readNodeData(raw)
      expect(data.bindings).toBeUndefined()
    })

    it('normalizeNodeData 保留 bindings，缺省补全为 {}', () => {
      const dataWithout = normalizeNodeData({ prompt: 'test' })
      expect(dataWithout.bindings).toEqual({})

      const dataWith = normalizeNodeData({
        prompt: 'test',
        bindings: { in1: { node: 'n1', port: 'out1' } },
      })
      expect(dataWith.bindings).toEqual({ in1: { node: 'n1', port: 'out1' } })
    })

    it('canonicalBindings 按输入端口名称码位序稳定排序', () => {
      const unordered = {
        zeta_in: { node: 'srcZ', port: 'out1' },
        alpha_in: { node: 'srcA', port: 'out2' },
        beta_in: { node: 'srcB', port: 'out3' },
      }
      const canonical = canonicalBindings(unordered)
      expect(canonical).toBeDefined()
      expect(Object.keys(canonical!)).toEqual(['alpha_in', 'beta_in', 'zeta_in'])
    })

    it('canonicalBindings 过滤空或无效项，全空时返回 undefined', () => {
      expect(canonicalBindings({})).toBeUndefined()
      expect(canonicalBindings(undefined)).toBeUndefined()

      const cleaned = canonicalBindings({
        valid: { node: 'n1', port: 'p1' },
      })
      expect(cleaned).toEqual({ valid: { node: 'n1', port: 'p1' } })
    })

    it('sameNodeData 正确比较 bindings 语义一致性', () => {
      const nodeA: NodeData = {
        prompt: 'p',
        bindings: {
          b: { node: 'nb', port: 'pb' },
          a: { node: 'na', port: 'pa' },
        },
      }
      const nodeB: NodeData = {
        prompt: 'p',
        bindings: {
          a: { node: 'na', port: 'pa' },
          b: { node: 'nb', port: 'pb' },
        },
      }
      const nodeC: NodeData = {
        prompt: 'p',
        bindings: {
          a: { node: 'na', port: 'other' },
        },
      }
      expect(sameNodeData(nodeA, nodeB)).toBe(true)
      expect(sameNodeData(nodeA, nodeC)).toBe(false)
    })

    it('cloneNodeData 进行深度拷贝，修改副本不影响原对象', () => {
      const original: NodeData = {
        prompt: 'test',
        bindings: {
          reads: { node: 'nodeA', port: 'out1' },
        },
      }
      const cloned = cloneNodeData(original)
      expect(cloned).toEqual(original)
      expect(cloned.bindings).not.toBe(original.bindings)

      cloned.bindings!.reads.port = 'changed'
      expect(original.bindings!.reads.port).toBe('out1')
    })

    it('带 bindings 的工作流文档 writeDocument -> readDocument -> writeDocument 往返逐字节恒等', () => {
      const originalDoc: WorkflowDocument = doc({
        nodes: [
          {
            id: 'upstream',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'step 1',
              ports: { outputs: [{ name: 'raw_data', type: 'fastq' }] },
            },
          },
          {
            id: 'downstream',
            type: 'wfNode',
            position: { x: 200, y: 0 },
            data: {
              prompt: 'step 2',
              ports: { inputs: [{ name: 'in_data', type: 'fastq', required: true }] },
              bindings: {
                in_data: { node: 'upstream', port: 'raw_data' },
              },
            },
          },
        ],
        edges: [
          {
            id: 'upstream->downstream',
            source: 'upstream',
            target: 'downstream',
            sourceHandle: null,
            targetHandle: null,
          },
        ],
      })

      const write1 = writeDocument(originalDoc)
      const parsed1 = readDocument(write1)
      expect(parsed1.problems).toHaveLength(0)
      expect(parsed1.document).not.toBeNull()

      const write2 = writeDocument(parsed1.document!)
      expect(write2).toBe(write1)

      const parsed2 = readDocument(write2)
      const write3 = writeDocument(parsed2.document!)
      expect(write3).toBe(write2)
    })
  })

  describe('校验问题码判定 (E_BINDING_*)', () => {
    it('E_BINDING_SOURCE_MISSING：源节点不存在时报错并阻塞编译', () => {
      const d = doc({
        nodes: [
          {
            id: 'step_target',
            type: 'wfNode',
            position: { x: 100, y: 100 },
            data: {
              prompt: 'target',
              ports: { inputs: [{ name: 'in_port', type: 'fastq' }] },
              bindings: {
                in_port: { node: 'non_existent_node', port: 'out_port' },
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canCompile).toBe(false)
      expect(report.compile).toContainEqual(
        expect.objectContaining({
          level: 'compile',
          code: 'E_BINDING_SOURCE_MISSING',
          node: 'step_target',
        }),
      )
    })

    it('E_BINDING_PORT_MISSING：源节点存在但无该输出端口时报错', () => {
      const d = doc({
        nodes: [
          {
            id: 'step_src',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'src',
              ports: { outputs: [{ name: 'actual_output', type: 'fastq' }] },
            },
          },
          {
            id: 'step_tgt',
            type: 'wfNode',
            position: { x: 200, y: 0 },
            data: {
              prompt: 'tgt',
              ports: { inputs: [{ name: 'in_port', type: 'fastq' }] },
              bindings: {
                in_port: { node: 'step_src', port: 'wrong_port' },
              },
            },
          },
        ],
        edges: [
          {
            id: 'step_src->step_tgt',
            source: 'step_src',
            target: 'step_tgt',
            sourceHandle: null,
            targetHandle: null,
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canCompile).toBe(false)
      expect(report.compile).toContainEqual(
        expect.objectContaining({
          level: 'compile',
          code: 'E_BINDING_PORT_MISSING',
          node: 'step_tgt',
        }),
      )
    })

    it('E_BINDING_PORT_MISSING：本节点无该输入端口（未知端口名不静默接受）', () => {
      const d = doc({
        nodes: [
          {
            id: 'step_node',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'step',
              ports: { inputs: [{ name: 'real_input', type: 'fastq' }] },
              bindings: {
                phantom_input: { node: 'any', port: 'any' },
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canCompile).toBe(false)
      expect(report.compile).toContainEqual(
        expect.objectContaining({
          level: 'compile',
          code: 'E_BINDING_PORT_MISSING',
          node: 'step_node',
        }),
      )
    })

    it('E_BINDING_NO_EDGE：源与目标节点之间无画布边时报错', () => {
      const d = doc({
        nodes: [
          {
            id: 'node_a',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'A',
              ports: { outputs: [{ name: 'out_p', type: 'fastq' }] },
            },
          },
          {
            id: 'node_b',
            type: 'wfNode',
            position: { x: 200, y: 0 },
            data: {
              prompt: 'B',
              ports: { inputs: [{ name: 'in_p', type: 'fastq' }] },
              bindings: {
                in_p: { node: 'node_a', port: 'out_p' },
              },
            },
          },
        ],
        edges: [], // 缺少画布边 node_a->node_b
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canCompile).toBe(false)
      expect(report.compile).toContainEqual(
        expect.objectContaining({
          level: 'compile',
          code: 'E_BINDING_NO_EDGE',
          node: 'node_b',
        }),
      )
    })

    it('E_BINDING_TYPE_INCOMPATIBLE：端口类型不兼容时报错', () => {
      const d = doc({
        nodes: [
          {
            id: 'node_a',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'A',
              ports: { outputs: [{ name: 'out_p', type: 'bam' }] },
            },
          },
          {
            id: 'node_b',
            type: 'wfNode',
            position: { x: 200, y: 0 },
            data: {
              prompt: 'B',
              ports: { inputs: [{ name: 'in_p', type: 'fastq' }] },
              bindings: {
                in_p: { node: 'node_a', port: 'out_p' },
              },
            },
          },
        ],
        edges: [
          {
            id: 'node_a->node_b',
            source: 'node_a',
            target: 'node_b',
            sourceHandle: null,
            targetHandle: null,
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canCompile).toBe(false)
      expect(report.compile).toContainEqual(
        expect.objectContaining({
          level: 'compile',
          code: 'E_BINDING_TYPE_INCOMPATIBLE',
          node: 'node_b',
        }),
      )
    })

    it('E_BINDING_TYPE_INCOMPATIBLE：利用 subtypes 子类型匹配时校验通过', () => {
      const subtypes = { file: ['fastq'] }
      const d = doc({
        nodes: [
          {
            id: 'node_a',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'A',
              ports: { outputs: [{ name: 'out_fq', type: 'fastq' }] },
            },
          },
          {
            id: 'node_b',
            type: 'wfNode',
            position: { x: 200, y: 0 },
            data: {
              prompt: 'B',
              ports: { inputs: [{ name: 'in_file', type: 'file' }] },
              bindings: {
                in_file: { node: 'node_a', port: 'out_fq' },
              },
            },
          },
        ],
        edges: [
          {
            id: 'node_a->node_b',
            source: 'node_a',
            target: 'node_b',
            sourceHandle: null,
            targetHandle: null,
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10, subtypes })
      expect(report.compile.filter((p) => p.code.startsWith('E_BINDING'))).toHaveLength(0)
    })

    it('E_BINDING_REQUIRED_MISSING：必填输入口未绑定时报编译级错误', () => {
      const d = doc({
        nodes: [
          {
            id: 'node_test',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'test',
              ports: {
                inputs: [
                  { name: 'mandatory_input', type: 'fastq', required: true },
                  { name: 'optional_input', type: 'fasta', required: false },
                ],
              },
              bindings: {}, // 必填输入未绑定
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canLoad).toBe(true) // 允许落盘
      expect(report.canCompile).toBe(false) // 阻塞编译
      expect(report.compile).toContainEqual(
        expect.objectContaining({
          level: 'compile',
          code: 'E_BINDING_REQUIRED_MISSING',
          node: 'node_test',
        }),
      )
    })

    it('一条画布边可承载多条具名数据绑定（边为布局，绑定为语义）', () => {
      const d = doc({
        nodes: [
          {
            id: 'step_multi_src',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'src',
              ports: {
                outputs: [
                  { name: 'reads1', type: 'fastq' },
                  { name: 'reads2', type: 'fastq' },
                  { name: 'qc_meta', type: 'json' },
                ],
              },
            },
          },
          {
            id: 'step_multi_tgt',
            type: 'wfNode',
            position: { x: 300, y: 0 },
            data: {
              prompt: 'tgt',
              ports: {
                inputs: [
                  { name: 'in_r1', type: 'fastq', required: true },
                  { name: 'in_r2', type: 'fastq', required: true },
                  { name: 'meta', type: 'json', required: false },
                ],
              },
              bindings: {
                in_r1: { node: 'step_multi_src', port: 'reads1' },
                in_r2: { node: 'step_multi_src', port: 'reads2' },
                meta: { node: 'step_multi_src', port: 'qc_meta' },
              },
            },
          },
        ],
        edges: [
          // 仅一条边 step_multi_src -> step_multi_tgt
          {
            id: 'step_multi_src->step_multi_tgt',
            source: 'step_multi_src',
            target: 'step_multi_tgt',
            sourceHandle: null,
            targetHandle: null,
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.compile.filter((p) => p.code.startsWith('E_BINDING'))).toHaveLength(0)
    })

    it('checkBindings 独立纯函数能正确扫描并返回问题集合', () => {
      const badDoc = doc({
        nodes: [
          {
            id: 'n1',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'node 1',
              ports: {
                inputs: [{ name: 'req_port', type: 'fastq', required: true }],
              },
              bindings: {
                non_existent_port: { node: 'ghost', port: 'p' },
              },
            },
          },
        ],
      })
      const problems = checkBindings(badDoc)
      const codes = problems.map((p) => p.code)
      expect(codes).toContain('E_BINDING_PORT_MISSING')
      expect(codes).toContain('E_BINDING_REQUIRED_MISSING')
      expect(problems.every((p) => p.level === 'compile')).toBe(true)
    })
  })

  describe('UI 呈现与属性面板选择 (StepCardPorts / StepPortsField)', () => {
    it('StepCardPorts 在输入端口有绑定时渲染来源标记', () => {
      const ports: NodePorts = {
        inputs: [{ name: 'reads_in', type: 'fastq', required: true }],
        outputs: [{ name: 'report', type: 'html' }],
      }
      const bindings = {
        reads_in: { node: 'fastqc_step', port: 'cleaned_reads' },
      }
      const html = renderToStaticMarkup(
        React.createElement(StepCardPorts, { ports, bindings }),
      )
      expect(html).toContain('wl-card-port-in')
      expect(html).toContain('wl-port-bound')
      expect(html).toContain('fastqc_step.cleaned_reads')
    })

    it('StepPortsField 渲染下拉选择框并展示类型兼容的候选源', () => {
      const sourceNode: StepNode = {
        id: 'node_source',
        type: 'wfNode',
        position: { x: 0, y: 0 },
        data: {
          label: '上游步骤',
          prompt: 'produce fastq',
          ports: {
            outputs: [
              { name: 'out_fastq', type: 'fastq' },
              { name: 'out_other', type: 'bam' },
            ],
          },
        },
      }
      const targetNode: StepNode = {
        id: 'node_target',
        type: 'wfNode',
        position: { x: 200, y: 0 },
        data: {
          prompt: 'consume fastq',
          ports: {
            inputs: [{ name: 'in_reads', type: 'fastq' }],
          },
        },
      }
      const testDoc = doc({
        nodes: [sourceNode, targetNode],
        edges: [
          {
            id: 'node_source->node_target',
            source: 'node_source',
            target: 'node_target',
            sourceHandle: null,
            targetHandle: null,
          },
        ],
      })

      const html = renderToStaticMarkup(
        React.createElement(StepPortsField, {
          ports: targetNode.data.ports,
          node: targetNode,
          doc: testDoc,
          onEdit: () => {},
        }),
      )

      expect(html).toContain('wl-bind-select-in_reads')
      expect(html).toContain('上游步骤 (node_source) / out_fastq (fastq)')
      // bam 与 fastq 不兼容，不应出现在候选中
      expect(html).not.toContain('out_other (bam)')
    })

    it('StepPortsField 已绑定时显示绑定的 node/port 并带有清除按钮', () => {
      const node: StepNode = {
        id: 'step_with_binding',
        type: 'wfNode',
        position: { x: 0, y: 0 },
        data: {
          prompt: 'test',
          ports: { inputs: [{ name: 'in_data', type: 'fastq' }] },
          bindings: {
            in_data: { node: 'src_node', port: 'out_port' },
          },
        },
      }
      const testDoc = doc({ nodes: [node] })
      const html = renderToStaticMarkup(
        React.createElement(StepPortsField, {
          ports: node.data.ports,
          node,
          doc: testDoc,
          onEdit: () => {},
        }),
      )
      expect(html).toContain('wl-port-bound-source')
      expect(html).toContain('src_node/out_port')
      expect(html).toContain('wl-clear-binding')
      expect(html).toContain('清除')
    })

    it('StepPortsField 无可用候选源时显示禁用原因', () => {
      const isolatedNode: StepNode = {
        id: 'isolated_node',
        type: 'wfNode',
        position: { x: 0, y: 0 },
        data: {
          prompt: 'alone',
          ports: { inputs: [{ name: 'in_data', type: 'fastq' }] },
        },
      }
      const testDoc = doc({ nodes: [isolatedNode] })
      const html = renderToStaticMarkup(
        React.createElement(StepPortsField, {
          ports: isolatedNode.data.ports,
          node: isolatedNode,
          doc: testDoc,
          onEdit: () => {},
        }),
      )
      expect(html).toContain('disabled')
      expect(html).toContain('wl-bind-disabled-reason')
      expect(html).toContain('无可用源节点')
    })
  })

  describe('端口级连线绑定 B 方案关键路径 (卡 X3)', () => {
    it('EdgeData 具名端口持久化与往返保真（sourcePort / targetPort）', () => {
      const edgeDoc = doc({
        nodes: [
          { id: 's1', type: 'wfNode', position: { x: 0, y: 0 }, data: { prompt: 's1' } },
          { id: 's2', type: 'wfNode', position: { x: 100, y: 0 }, data: { prompt: 's2' } },
        ],
        edges: [
          {
            id: 's1->s2',
            source: 's1',
            target: 's2',
            sourceHandle: null,
            targetHandle: null,
            data: {
              sourcePort: 'out_fastq',
              targetPort: 'in_reads',
            },
          },
        ],
      })
      const text = writeDocument(edgeDoc)
      const parsed = readDocument(text)
      expect(parsed.document).not.toBeNull()
      expect(parsed.document?.edges[0]?.data?.sourcePort).toBe('out_fastq')
      expect(parsed.document?.edges[0]?.data?.targetPort).toBe('in_reads')
      expect(writeDocument(parsed.document!)).toBe(text)
    })

    it('isValidConnection 在两端具名端口指定时按端口类型校验', () => {
      const srcNodeData: NodeData = {
        ports: { outputs: [{ name: 'out_f', type: 'fastq' }, { name: 'out_b', type: 'bam' }] },
      }
      const tgtNodeData: NodeData = {
        ports: { inputs: [{ name: 'in_f', type: 'fastq' }] },
      }
      // 兼容端口对返回 true
      expect(isValidConnection(srcNodeData, tgtNodeData, undefined, 'out_f', 'in_f')).toBe(true)
      // 不兼容端口对返回 false
      expect(isValidConnection(srcNodeData, tgtNodeData, undefined, 'out_b', 'in_f')).toBe(false)
    })

    it('连线端口绑定优先于节点级 bindings（端口级优先，未声明回落节点级）', () => {
      const testDoc = doc({
        nodes: [
          {
            id: 'src',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'src',
              ports: { outputs: [{ name: 'out_reads', type: 'fastq' }] },
            },
          },
          {
            id: 'tgt',
            type: 'wfNode',
            position: { x: 200, y: 0 },
            data: {
              prompt: 'tgt',
              ports: { inputs: [{ name: 'in_reads', type: 'fastq', required: true }] },
              // 节点级填了无效源，但连线端口级覆盖它
              bindings: { in_reads: { node: 'invalid_node', port: 'invalid_port' } },
            },
          },
        ],
        edges: [
          {
            id: 'src->tgt',
            source: 'src',
            target: 'tgt',
            sourceHandle: null,
            targetHandle: null,
            data: { sourcePort: 'out_reads', targetPort: 'in_reads' },
          },
        ],
      })
      // 有效端口绑定解析结果应为连线端口级覆盖的结果
      const effective = resolveEffectiveBindings(testDoc.nodes[1] as StepNode, testDoc)
      expect(effective.in_reads).toEqual({ node: 'src', port: 'out_reads' })

      // validate 规则检查：连线端口级优先覆盖后，节点级 invalid_node 不报 E_BINDING_SOURCE_MISSING，必填项满足
      const problems = checkBindings(testDoc)
      expect(problems.filter((p) => p.code === 'E_BINDING_REQUIRED_MISSING')).toHaveLength(0)
      expect(problems.filter((p) => p.code === 'E_BINDING_SOURCE_MISSING')).toHaveLength(0)
    })
  })
})
