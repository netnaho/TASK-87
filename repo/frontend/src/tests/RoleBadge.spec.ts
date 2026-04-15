/**
 * Component smoke + logic tests for RoleBadge.
 *
 * Tests the computed role-type and label mapping without depending on
 * Naive UI's internal rendering — NTag is stubbed to a plain <span>.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RoleBadge from '../components/shared/RoleBadge.vue';

const NTagStub = {
  name: 'NTag',
  props: ['type', 'size', 'round'],
  template: '<span :data-type="type"><slot /></span>',
};

function mountBadge(role: string) {
  return mount(RoleBadge, {
    props: { role: role as any },
    global: { stubs: { NTag: NTagStub } },
  });
}

describe('RoleBadge — smoke (mounts without throwing)', () => {
  const allRoles = ['ADMIN', 'MANAGER', 'INVENTORY_CLERK', 'FRONT_DESK', 'HOST', 'GUEST', 'MODERATOR'];

  for (const role of allRoles) {
    it(`renders for role "${role}"`, () => {
      const wrapper = mountBadge(role);
      expect(wrapper.exists()).toBe(true);
    });
  }
});

describe('RoleBadge — label mapping', () => {
  it('displays "Admin" label for ADMIN role', () => {
    const wrapper = mountBadge('ADMIN');
    expect(wrapper.text()).toBe('Admin');
  });

  it('displays "Manager" label for MANAGER role', () => {
    const wrapper = mountBadge('MANAGER');
    expect(wrapper.text()).toBe('Manager');
  });

  it('displays "Clerk" label for INVENTORY_CLERK role', () => {
    const wrapper = mountBadge('INVENTORY_CLERK');
    expect(wrapper.text()).toBe('Clerk');
  });

  it('displays "Front Desk" label for FRONT_DESK role', () => {
    const wrapper = mountBadge('FRONT_DESK');
    expect(wrapper.text()).toBe('Front Desk');
  });

  it('displays "Host" label for HOST role', () => {
    const wrapper = mountBadge('HOST');
    expect(wrapper.text()).toBe('Host');
  });

  it('displays "Guest" label for GUEST role', () => {
    const wrapper = mountBadge('GUEST');
    expect(wrapper.text()).toBe('Guest');
  });

  it('displays "Moderator" label for MODERATOR role', () => {
    const wrapper = mountBadge('MODERATOR');
    expect(wrapper.text()).toBe('Moderator');
  });

  it('falls back to the raw role value for an unknown role', () => {
    const wrapper = mountBadge('UNKNOWN_ROLE' as any);
    expect(wrapper.text()).toBe('UNKNOWN_ROLE');
  });
});

describe('RoleBadge — type mapping (via computed property)', () => {
  it('uses "error" type for ADMIN', () => {
    const wrapper = mountBadge('ADMIN');
    expect((wrapper.vm as any).roleType).toBe('error');
  });

  it('uses "warning" type for MANAGER', () => {
    const wrapper = mountBadge('MANAGER');
    expect((wrapper.vm as any).roleType).toBe('warning');
  });

  it('uses "info" type for INVENTORY_CLERK', () => {
    const wrapper = mountBadge('INVENTORY_CLERK');
    expect((wrapper.vm as any).roleType).toBe('info');
  });

  it('uses "success" type for HOST', () => {
    const wrapper = mountBadge('HOST');
    expect((wrapper.vm as any).roleType).toBe('success');
  });

  it('uses "default" type for GUEST', () => {
    const wrapper = mountBadge('GUEST');
    expect((wrapper.vm as any).roleType).toBe('default');
  });

  it('uses "warning" type for MODERATOR', () => {
    const wrapper = mountBadge('MODERATOR');
    expect((wrapper.vm as any).roleType).toBe('warning');
  });

  it('falls back to "default" type for unknown role', () => {
    const wrapper = mountBadge('UNKNOWN' as any);
    expect((wrapper.vm as any).roleType).toBe('default');
  });
});
