/**
 * Component smoke + logic tests for TrustScoreGauge.
 *
 * Stubs NProgress and NTag so tests run without the full Naive UI
 * install; validates computed color, tier, and percentage clamping.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrustScoreGauge from '../components/shared/TrustScoreGauge.vue';

const NProgressStub = {
  name: 'NProgress',
  props: ['percentage', 'color', 'rail-color', 'stroke-width', 'style'],
  template: '<div :data-pct="percentage" :data-color="color"><slot /></div>',
};

const NTagStub = {
  name: 'NTag',
  props: ['type', 'size', 'round'],
  template: '<span :data-type="type"><slot /></span>',
};

function mountGauge(score: number, size?: 'small' | 'large') {
  return mount(TrustScoreGauge, {
    props: { score, size },
    global: { stubs: { NProgress: NProgressStub, NTag: NTagStub } },
  });
}

describe('TrustScoreGauge — smoke', () => {
  it('mounts without throwing for score 0', () => {
    expect(mountGauge(0).exists()).toBe(true);
  });

  it('mounts without throwing for score 50', () => {
    expect(mountGauge(50).exists()).toBe(true);
  });

  it('mounts without throwing for score 100', () => {
    expect(mountGauge(100).exists()).toBe(true);
  });
});

describe('TrustScoreGauge — percentage clamping (via computed property)', () => {
  it('percentage equals score within [0, 100]', () => {
    const wrapper = mountGauge(72);
    expect((wrapper.vm as any).percentage).toBe(72);
  });

  it('clamps percentage to 100 when score exceeds 100', () => {
    const wrapper = mountGauge(120);
    expect((wrapper.vm as any).percentage).toBe(100);
  });

  it('clamps percentage to 0 when score is negative', () => {
    const wrapper = mountGauge(-10);
    expect((wrapper.vm as any).percentage).toBe(0);
  });
});

describe('TrustScoreGauge — tier labels', () => {
  it('shows "Excellent" for score >= 75', () => {
    const wrapper = mountGauge(80);
    expect(wrapper.text()).toContain('Excellent');
  });

  it('shows "Fair" for score in [50, 74]', () => {
    const wrapper = mountGauge(65);
    expect(wrapper.text()).toContain('Fair');
  });

  it('shows "At Risk" for score < 50', () => {
    const wrapper = mountGauge(30);
    expect(wrapper.text()).toContain('At Risk');
  });

  it('boundary: score exactly 75 shows "Excellent"', () => {
    expect(mountGauge(75).text()).toContain('Excellent');
  });

  it('boundary: score exactly 50 shows "Fair"', () => {
    expect(mountGauge(50).text()).toContain('Fair');
  });

  it('boundary: score exactly 49 shows "At Risk"', () => {
    expect(mountGauge(49).text()).toContain('At Risk');
  });
});

describe('TrustScoreGauge — color coding (via computed property)', () => {
  it('uses green color for score >= 75', () => {
    const wrapper = mountGauge(80);
    expect((wrapper.vm as any).color).toBe('#22c55e');
  });

  it('uses amber color for score in [50, 74]', () => {
    const wrapper = mountGauge(60);
    expect((wrapper.vm as any).color).toBe('#f59e0b');
  });

  it('uses red color for score < 50', () => {
    const wrapper = mountGauge(20);
    expect((wrapper.vm as any).color).toBe('#ef4444');
  });

  it('boundary: score 75 uses green', () => {
    expect((mountGauge(75).vm as any).color).toBe('#22c55e');
  });

  it('boundary: score 50 uses amber', () => {
    expect((mountGauge(50).vm as any).color).toBe('#f59e0b');
  });
});

describe('TrustScoreGauge — tag type (via computed property)', () => {
  it('"success" tag type for score >= 75', () => {
    expect((mountGauge(90).vm as any).tagType).toBe('success');
  });

  it('"warning" tag type for score in [50, 74]', () => {
    expect((mountGauge(55).vm as any).tagType).toBe('warning');
  });

  it('"error" tag type for score < 50', () => {
    expect((mountGauge(10).vm as any).tagType).toBe('error');
  });
});
