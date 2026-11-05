import { describe, expect, it } from 'vitest'
import {
  canonicalPorts,
  canonicalPortSpec,
  cloneNodeData,
  readDocument,
  readNodeData,
  readPorts,
  sameNodeData,
  writeDocument,
} from '../src/shared/model.ts'
import type { NodeData, NodePorts, PortSpec, WorkflowDocument } from '../src/shared/types.ts'
import { checkPorts, validateDocument } from '../src/shared/validate.ts'

function doc(partial: Partial<WorkflowDocument> = {}): WorkflowDocument {
  return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, ...partial }
}

describe('ports specification (卡 F1: 端口声明模型 + 校验问题码)', () => {
  describe('readNodeData 保真', () => {
    it('完整保留 ports.inputs 与 ports.outputs 的所有声明字段', () => {
      const raw = {
        prompt: 'run analysis',
        ports: {
          inputs: [
            {
              name: 'fastq_file',
              type: 'file',
              required: true,
              multiple: false,
              description: '待分析的测序数据',
            },
            {
              name: 'reference',
              type: 'file',
              required: false,
              multiple: true,
            },
          ],
          outputs: [
            {
              name: 'qc_report',
              type: 'file',
              required: true,
              multiple: false,
              description: '质控结果报告',
            },
            {
              name: 'summary_stats',
              type: 'json',
            },
          ],
        },
      }

      const data = readNodeData(raw)
      expect(data.ports).toBeDefined()
      expect(data.ports?.inputs).toHaveLength(2)
      expect(data.ports?.outputs).toHaveLength(2)

      expect(data.ports?.inputs?.[0]).toEqual({
        name: 'fastq_file',
        type: 'file',
        required: true,
        multiple: false,
        description: '待分析的测序数据',
      })
      expect(data.ports?.inputs?.[1]).toEqual({
        name: 'reference',
        type: 'file',
        required: false,
        multiple: true,
      })

      expect(data.ports?.outputs?.[0]).toEqual({
        name: 'qc_report',
        type: 'file',
        required: true,
        multiple: false,
        description: '质控结果报告',
      })
      expect(data.ports?.outputs?.[1]).toEqual({
        name: 'summary_stats',
        type: 'json',
      })
    })

    it('读入时保持数组输入顺序（保真，不提前破坏调用者顺序）', () => {
      const raw = {
        prompt: 'sort check',
        ports: {
          inputs: [
            { name: 'z_input', type: 'string' },
            { name: 'a_input', type: 'string' },
            { name: 'm_input', type: 'string' },
          ],
        },
      }
      const data = readNodeData(raw)
      expect(data.ports?.inputs?.map((p) => p.name)).toEqual(['z_input', 'a_input', 'm_input'])
    })

    it('白名单过滤未知多余字段', () => {
      const raw = {
        prompt: 'p',
        ports: {
          inputs: [
            {
              name: 'in1',
              type: 'string',
              extra_unknown_field: 'ignored',
              anotherField: 12345,
            },
          ],
        },
      }
      const data = readNodeData(raw)
      expect(data.ports?.inputs?.[0]).toEqual({
        name: 'in1',
        type: 'string',
      })
      expect('extra_unknown_field' in (data.ports?.inputs?.[0] ?? {})).toBe(false)
    })

    it('非对象元素回落占位，不抛异常', () => {
      const raw = {
        prompt: 'p',
        ports: {
          inputs: ['invalid-string-element', null, 42],
        },
      }
      const data = readNodeData(raw)
      expect(data.ports?.inputs).toEqual([
        { name: '', type: '' },
        { name: '', type: '' },
        { name: '', type: '' },
      ])
    })
  })

  describe('旧图无 ports 不受影响', () => {
    it('旧节点无 ports 时不注入空对象，避免污染旧图', () => {
      const oldRaw = {
        label: '老节点',
        prompt: 'echo hello',
        icon: 'terminal',
        color: 'gray',
      }
      const data = readNodeData(oldRaw)
      expect(data.ports).toBeUndefined()
      expect('ports' in data).toBe(false)
    })

    it('空 ports 对象不会在旧图序列化中写出多余的 ports 字段', () => {
      const docWithoutPorts: WorkflowDocument = doc({
        nodes: [
          {
            id: 'legacy_step',
            type: 'wfNode',
            position: { x: 10, y: 20 },
            data: { prompt: 'legacy task' },
          },
        ],
      })

      const jsonText = writeDocument(docWithoutPorts)
      expect(jsonText).not.toContain('"ports"')

      const parsed = readDocument(jsonText)
      expect(parsed.problems).toHaveLength(0)
      expect((parsed.document?.nodes[0]?.data as NodeData | undefined)?.ports).toBeUndefined()
    })

    it('旧图 round-trip 写回逐字节相同', () => {
      const docWithoutPorts: WorkflowDocument = doc({
        nodes: [
          {
            id: 'step_a',
            type: 'wfNode',
            position: { x: 100, y: 200 },
            data: { label: 'A', prompt: 'echo a' },
          },
        ],
        edges: [],
      })

      const firstWrite = writeDocument(docWithoutPorts)
      const parsed = readDocument(firstWrite)
      expect(parsed.document).not.toBeNull()
      const secondWrite = writeDocument(parsed.document!)
      expect(secondWrite).toBe(firstWrite)
    })
  })

  describe('canonical 写回幂等（round-trip 相等）', () => {
    it('按 name 稳定排序（码位序）', () => {
      const unsortedPorts: NodePorts = {
        inputs: [
          { name: 'zeta', type: 'string' },
          { name: 'alpha', type: 'string' },
          { name: 'beta', type: 'string' },
        ],
        outputs: [
          { name: 'out_y', type: 'file' },
          { name: 'out_a', type: 'file' },
        ],
      }

      const canonical = canonicalPorts(unsortedPorts)
      expect(canonical?.inputs?.map((p) => p.name)).toEqual(['alpha', 'beta', 'zeta'])
      expect(canonical?.outputs?.map((p) => p.name)).toEqual(['out_a', 'out_y'])
    })

    it('丢弃空字段（空白描述、false 标志、空数组）', () => {
      const portsWithEmptyFields: NodePorts = {
        inputs: [
          {
            name: 'in1',
            type: 'file',
            required: false, // 丢弃 false
            multiple: false, // 丢弃 false
            description: '   ', // 丢弃空白
          },
          {
            name: 'in2',
            type: 'string',
            required: true,
            description: '有效描述',
          },
        ],
        outputs: [], // 空数组丢弃
      }

      const canonical = canonicalPorts(portsWithEmptyFields)
      expect(canonical?.outputs).toBeUndefined()
      expect(canonical?.inputs).toHaveLength(2)

      expect(canonical?.inputs?.[0]).toEqual({
        name: 'in1',
        type: 'file',
      })
      expect(canonical?.inputs?.[1]).toEqual({
        name: 'in2',
        type: 'string',
        required: true,
        description: '有效描述',
      })
    })

    it('带 ports 文档 writeDocument -> readDocument -> writeDocument round-trip 逐字节恒等', () => {
      const originalDoc: WorkflowDocument = doc({
        nodes: [
          {
            id: 'fastqc',
            type: 'wfNode',
            position: { x: 50, y: 100 },
            data: {
              label: 'FastQC',
              prompt: 'fastqc input.fastq.gz',
              ports: {
                inputs: [
                  { name: 'reads_2', type: 'fastq', required: false },
                  { name: 'reads_1', type: 'fastq', required: true, description: '前向测序序列' },
                ],
                outputs: [
                  { name: 'qc_zip', type: 'zip' },
                  { name: 'html_report', type: 'html', description: '网页报告' },
                ],
              },
            },
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

    it('sameNodeData 判定：相同端口内容（即使初始乱序或带空字段）判定为相等', () => {
      const a: NodeData = {
        prompt: 'test',
        ports: {
          inputs: [
            { name: 'b', type: 'string' },
            { name: 'a', type: 'string', required: true },
          ],
        },
      }
      const b: NodeData = {
        prompt: 'test',
        ports: {
          inputs: [
            { name: 'a', type: 'string', required: true, multiple: false },
            { name: 'b', type: 'string', description: '' },
          ],
        },
      }
      expect(sameNodeData(a, b)).toBe(true)
    })

    it('cloneNodeData 进行深度拷贝，修改互不影响', () => {
      const original: NodeData = {
        prompt: 'test',
        ports: {
          inputs: [{ name: 'in1', type: 'string' }],
          outputs: [{ name: 'out1', type: 'string' }],
        },
      }
      const cloned = cloneNodeData(original)
      expect(cloned).toEqual(original)
      expect(cloned.ports).not.toBe(original.ports)
      expect(cloned.ports?.inputs).not.toBe(original.ports?.inputs)

      cloned.ports?.inputs?.push({ name: 'in2', type: 'number' })
      expect(original.ports?.inputs).toHaveLength(1)
      expect(cloned.ports?.inputs).toHaveLength(2)
    })
  })

  describe('校验问题码与被拒 (validation rejection)', () => {
    it('空端口名被拒：报 port_name_empty，保存级（canLoad 为 false）', () => {
      const d = doc({
        nodes: [
          {
            id: 'node1',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'test',
              ports: {
                inputs: [{ name: '   ', type: 'string' }],
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canLoad).toBe(false)
      expect(report.save).toContainEqual(
        expect.objectContaining({
          level: 'save',
          code: 'port_name_empty',
          node: 'node1',
        }),
      )
    })

    it('输入口重复名被拒：报 port_name_duplicate，保存级', () => {
      const d = doc({
        nodes: [
          {
            id: 'node1',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'test',
              ports: {
                inputs: [
                  { name: 'dup_port', type: 'string' },
                  { name: 'dup_port', type: 'number' },
                ],
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canLoad).toBe(false)
      expect(report.save).toContainEqual(
        expect.objectContaining({
          level: 'save',
          code: 'port_name_duplicate',
          node: 'node1',
        }),
      )
    })

    it('输出口重复名被拒：报 port_name_duplicate，保存级', () => {
      const d = doc({
        nodes: [
          {
            id: 'node1',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'test',
              ports: {
                outputs: [
                  { name: 'result', type: 'file' },
                  { name: 'result', type: 'text' },
                ],
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canLoad).toBe(false)
      expect(report.save).toContainEqual(
        expect.objectContaining({
          level: 'save',
          code: 'port_name_duplicate',
          node: 'node1',
        }),
      )
    })

    it('非法 type（非空字符串要求）被拒：报 port_type_invalid，保存级', () => {
      const d = doc({
        nodes: [
          {
            id: 'node1',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'test',
              ports: {
                inputs: [{ name: 'valid_name', type: '   ' }],
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canLoad).toBe(false)
      expect(report.save).toContainEqual(
        expect.objectContaining({
          level: 'save',
          code: 'port_type_invalid',
          node: 'node1',
        }),
      )
    })

    it('跨 inputs 与 outputs 同名冲突被拒：报 port_name_conflict，保存级', () => {
      const d = doc({
        nodes: [
          {
            id: 'node1',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'test',
              ports: {
                inputs: [{ name: 'shared_name', type: 'string' }],
                outputs: [{ name: 'shared_name', type: 'string' }],
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.canLoad).toBe(false)
      expect(report.save).toContainEqual(
        expect.objectContaining({
          level: 'save',
          code: 'port_name_conflict',
          node: 'node1',
        }),
      )
    })

    it('required 与 multiple 同时为 true 明确允许（正常通过）', () => {
      const d = doc({
        nodes: [
          {
            id: 'node1',
            type: 'wfNode',
            position: { x: 0, y: 0 },
            data: {
              prompt: 'test',
              ports: {
                inputs: [
                  {
                    name: 'file_list',
                    type: 'file[]',
                    required: true,
                    multiple: true,
                    description: '必传的多个文件',
                  },
                ],
              },
            },
          },
        ],
      })
      const report = validateDocument(d, { workflowName: 'test-wf', maxNodes: 10 })
      expect(report.save).toHaveLength(0)
      expect(report.canLoad).toBe(true)
    })

    it('checkPorts 函数单元测试', () => {
      const invalidPorts: NodePorts = {
        inputs: [
          { name: '', type: 'string' },
          { name: 'p1', type: '' },
          { name: 'p2', type: 'string' },
          { name: 'p2', type: 'string' },
          { name: 'cross', type: 'string' },
        ],
        outputs: [{ name: 'cross', type: 'string' }],
      }
      const problems = checkPorts(invalidPorts, 'nodeX')
      const codes = problems.map((p) => p.code)
      expect(codes).toContain('port_name_empty')
      expect(codes).toContain('port_type_invalid')
      expect(codes).toContain('port_name_duplicate')
      expect(codes).toContain('port_name_conflict')
      expect(problems.every((p) => p.level === 'save')).toBe(true)
      expect(problems.every((p) => p.node === 'nodeX')).toBe(true)
    })
  })
})
