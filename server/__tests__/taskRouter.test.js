import { describe, it, expect } from '@jest/globals';
import { detectTool, agentsForTool } from '../services/taskRouterService.js';

describe('detectTool', () => {
  it('routes PCB requests', () => {
    expect(detectTool('design a 4-layer drone flight controller PCB')).toBe('pcb');
    expect(detectTool('schematic for a sensor circuit')).toBe('pcb');
  });

  it('routes CAD requests', () => {
    expect(detectTool('parametric enclosure STL for a project')).toBe('cad');
    expect(detectTool('3D model of a phone stand')).toBe('cad');
  });

  it('routes game requests', () => {
    expect(detectTool('build a racing game with neon worlds')).toBe('game');
    expect(detectTool('multiplayer shooter arena')).toBe('game');
  });

  it('routes firmware requests', () => {
    expect(detectTool('firmware for an ESP32 robot')).toBe('firmware');
    expect(detectTool('arduino motor controller')).toBe('firmware');
  });

  it('routes video and quantum requests', () => {
    expect(detectTool('render an mp4 intro video')).toBe('video');
    expect(detectTool('simulate a 2-qubit quantum circuit')).toBe('quantum');
  });

  it('defaults to website for everything else', () => {
    expect(detectTool('a landing page for my coffee shop')).toBe('website');
    expect(detectTool('')).toBe('website');
    expect(detectTool(null)).toBe('website');
  });
});

describe('agentsForTool', () => {
  it('returns the PCB team', () => {
    expect(agentsForTool('pcb')).toEqual(['Core', 'Builder', 'Designer', 'QA']);
  });

  it('returns the full website team as fallback', () => {
    expect(agentsForTool('nonexistent-tool')).toEqual([
      'Core', 'Builder', 'Designer', 'QA', 'Scout', 'Sweeper',
    ]);
  });
});
