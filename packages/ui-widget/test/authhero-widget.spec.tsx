import { newSpecPage, SpecPage } from '@stencil/core/testing';
import { AuthheroWidget } from '../src/components/authhero-widget/authhero-widget';
import { AuthheroNode } from '../src/components/authhero-node/authhero-node';
import { screens } from './fixtures';

describe('authhero-widget', () => {
  it('renders login screen from JSON string prop', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    // Widget renders authhero-node children in its shadow DOM
    const nodeElements = page.root!.shadowRoot!.querySelectorAll('authhero-node');
    expect(nodeElements.length).toBe(screens.login.components.length);
  });

  it('renders login with social providers', async () => {
    // Escape for HTML attribute (single quotes break with apostrophe in "Don't")
    const screenJson = JSON.stringify(screens.loginWithSocial).replace(/'/g, '&#39;');
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${screenJson}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    // Check for social buttons
    const nodeElements = page.root!.shadowRoot!.querySelectorAll('authhero-node');
    expect(nodeElements.length).toBeGreaterThan(0);
  });

  it('displays error message when present', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.loginError)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const errorEl = page.root!.shadowRoot!.querySelector('.message-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain('Invalid credentials');
  });

  it('renders signup screen with all fields', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.signup)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    // Count the components
    const nodeElements = page.root!.shadowRoot!.querySelectorAll('authhero-node');
    expect(nodeElements.length).toBe(screens.signup.components.length);
  });

  it('renders MFA TOTP screen', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.mfaTotp)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
  });

  it('renders forgot password screen', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.forgotPassword)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
  });

  it('renders success screen', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.success)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    const successMsg = page.root!.shadowRoot!.querySelector('.message-success');
    expect(successMsg).not.toBeNull();
  });

  it('applies custom branding from fixture', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.brandedLogin)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    const container = page.root!.shadowRoot!.querySelector('.widget-container');
    expect(container).not.toBeNull();
  });

  it('shows empty state when no screen provided', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget></authhero-widget>`,
    });

    await page.waitForChanges();

    const errorMessage = page.root!.shadowRoot!.querySelector('.error-message');
    expect(errorMessage).not.toBeNull();
    expect(errorMessage!.textContent).toContain('No screen configuration provided');
  });

  it('shows loading state', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget loading="true"></authhero-widget>`,
    });

    await page.waitForChanges();

    const spinner = page.root!.shadowRoot!.querySelector('.loading-spinner');
    expect(spinner).not.toBeNull();
  });

  it('renders screen title', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const title = page.root!.shadowRoot!.querySelector('.title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe(screens.login.title);
  });

  it('renders links from meta', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const links = page.root!.shadowRoot!.querySelector('.links');
    expect(links).not.toBeNull();
    const linkElements = links!.querySelectorAll('a');
    expect(linkElements.length).toBe(screens.login.links?.length || 0);
  });

  it('emits screenChange event on initial load', async () => {
    const screenChangeSpy = jest.fn();

    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget></authhero-widget>`,
    });

    page.root!.addEventListener('screenChange', screenChangeSpy);

    // Update the screen attribute
    page.root!.setAttribute('screen', JSON.stringify(screens.login));
    await page.waitForChanges();

    expect(screenChangeSpy).toHaveBeenCalled();
  });

  it('renders form element', async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const form = page.root!.shadowRoot!.querySelector('form');
    expect(form).not.toBeNull();
  });
});
