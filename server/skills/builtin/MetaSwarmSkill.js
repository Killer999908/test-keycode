/**
 * MetaSwarmSkill - Absolute Meta-Evolutionary Swarm Intelligence Engine
 * Encodes the meta-swarm operating doctrine: cognitive poly-routing across
 * Gemini / NVIDIA NIM / OpenRouter, autonomous tool synthesis, ephemeral
 * micro-agent spawning, headless OS orchestration, industrial hardware CAM,
 * and custom engine / game-loop mastery. Injected into the agent's system
 * prompt when enabled for a build.
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class MetaSwarmSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'meta-swarm',
      name: 'Meta-Swarm Engine',
      description: 'Meta-evolutionary swarm doctrine: AI poly-routing mesh (Gemini/NVIDIA NIM/OpenRouter), autonomous tool synthesis, ephemeral micro-agent spawning, headless OS orchestration, industrial hardware CAM, and custom game-engine mastery',
      version: '1.0.0',
      category: SkillCategory.AUTOMATION,
      author: 'KEYCODE',
      keywords: ['swarm', 'orchestration', 'poly-routing', 'gemini', 'nvidia', 'openrouter', 'micro-agents', 'cam', 'kicad', 'gerber', 'game-engine', 'headless'],
      permissions: [SkillPermission.SHELL, SkillPermission.NETWORK, SkillPermission.FILESYSTEM, SkillPermission.AI_MODEL],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          preferRouters: {
            type: 'array',
            items: { type: 'string', enum: ['gemini', 'nvidia-nim', 'openrouter'] },
            default: ['gemini', 'nvidia-nim', 'openrouter'],
            description: 'Cognitive poly-routing mesh priority order'
          },
          spawnMicroAgents: { type: 'boolean', default: true, description: 'Allow ephemeral micro-agent spawn for parallel sub-tasks' },
          selfHealIterations: { type: 'integer', default: 5, minimum: 1, maximum: 20, description: 'Max self-correcting execution iterations before escalating' },
          productionFinality: { type: 'boolean', default: true, description: 'Enforce 100% production-ready output — no stubs, TODOs, or truncation' }
        },
        defaultConfig: {
          preferRouters: ['gemini', 'nvidia-nim', 'openrouter'],
          spawnMicroAgents: true,
          selfHealIterations: 5,
          productionFinality: true
        }
      },
      examples: [
        { prompt: 'Design a 4-layer PCB with differential pairs and export Gerbers', description: 'Industrial CAM pipeline via poly-routed swarm' },
        { prompt: 'Build a multiplayer game with client-server state sync and physics', description: 'Game-loop + replication doctrine' },
        { prompt: 'Compile a missing toolchain and scaffold the project', description: 'Autonomous tool synthesis' }
      ]
    });
    super(definition);
  }

  /**
   * Doctrine injected into the agent's system prompt when this skill is
   * enabled. Kept dense — every line must change agent behavior.
   */
  static expertisePrompt(config = {}) {
    const {
      preferRouters = ['gemini', 'nvidia-nim', 'openrouter'],
      selfHealIterations = 5,
      productionFinality = true
    } = config;

    return [
      'META-SWARM OPERATING DOCTRINE:',
      '',
      'COGNITIVE POLY-ROUTING MESH (priority: ' + preferRouters.join(' → ') + '):',
      '- Gemini engine: deep multi-step planning, long-horizon context evaluation, refactoring maps, multi-modal visual verification.',
      '- NVIDIA NIM fabric: low-latency math, algorithmic mesh generation, procedural geometry loops, primary code compilation.',
      '- OpenRouter consensus mesh: swarm-voting fallback across open weights; parallel routing to cross-verify logic and run code-review loops when primary routers hit rate limits.',
      '- Keys stay in the execution container (GEMINI_API_KEY, NVIDIA_NIM_API_KEY, OPENROUTER_API_KEY). Never echo them into logs or file outputs.',
      '',
      'META-EVOLUTIONARY SKILLS:',
      '- Autonomous tool synthesis: if a compiler, framework, or utility is missing, write and run the build script to provision it before proceeding.',
      '- Micro-agent spawn: decompose into parallel sub-tasks (e.g. schematic + trace-impedance test; netcode + exploit audit) and merge results.',
      '- Headless OS orchestration: Xvfb framebuffers, udev layouts, canvas-frame analysis, scripted input — audit GUIs without human eyes.',
      '- Industrial hardware CAM: KiCad/Pad2Pad/EasyEDA-ready layouts, impedance computation, differential pairs, power planes, thermal vias, multi-layer Gerbers.',
      '- Engines & game loops: Godot / Unreal C++ / Unity C# / native Rust-C++ backends; client-server state sync, physics collision, procedural map compilation.',
      '',
      'EXECUTION PROTOCOLS:',
      '- ' + (productionFinality ? '100% production-ready finality: no stubs, no TODOs, no truncation. Every output compiles.' : 'Prefer complete output; flag any genuinely deferred work explicitly.'),
      '- Self-correcting iteration: on any error, isolate the traceback cause, patch, and re-execute — up to ' + selfHealIterations + ' recursive cycles before escalating to the user.',
      '- Radical focus: no greetings, filler, or restating the task. Deliver the folder tree, the code, and the exact commands.'
    ].join('\n');
  }

  validateInput(input) {
    if (!input.prompt && !input.params?.task) {
      return { valid: false, errors: ['prompt or task is required'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input, context = {}) {
    const config = { ...this.definition.defaultConfig, ...(context.config || {}) };
    const validation = this.validateInput(input);
    if (!validation.valid) return { success: false, errors: validation.errors };

    // The skill's primary effect is doctrinal: return the prompt fragment the
    // agent engine merges into its system rules, plus the routing preference.
    return {
      success: true,
      expertisePrompt: MetaSwarmSkill.expertisePrompt(config),
      preferRouters: config.preferRouters,
      spawnMicroAgents: config.spawnMicroAgents
    };
  }
}
