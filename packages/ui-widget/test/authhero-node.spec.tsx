import { newSpecPage } from '@stencil/core/testing';
import { AuthheroNode } from '../src/components/authhero-node/authhero-node';
import type { UINode } from '../src/types/nodes';

describe('authhero-node', () => {
  describe('input nodes', () => {
    it('renders text input', async () => {
      const node: UINode = {
        id: 'email',
        type: 'input',
        attributes: {
          name: 'email',
          type: 'email',
          required: true,
          placeholder: 'Enter email',
        },
        meta: {
          label: 'Email address',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const input = page.root!.shadowRoot!.querySelector('input');
      expect(input).not.toBeNull();
      expect(input!.getAttribute('type')).toBe('email');
      expect(input!.getAttribute('name')).toBe('email');
      expect(input!.hasAttribute('required')).toBe(true);

      const label = page.root!.shadowRoot!.querySelector('label');
      expect(label!.textContent).toContain('Email address');
    });

    it('renders password input', async () => {
      const node: UINode = {
        id: 'password',
        type: 'input',
        attributes: {
          name: 'password',
          type: 'password',
          required: true,
        },
        meta: {
          label: 'Password',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const input = page.root!.shadowRoot!.querySelector('input');
      expect(input!.getAttribute('type')).toBe('password');
    });

    it('renders checkbox input', async () => {
      const node: UINode = {
        id: 'remember',
        type: 'input',
        attributes: {
          name: 'remember',
          type: 'checkbox',
        },
        meta: {
          label: 'Remember me',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const input = page.root!.shadowRoot!.querySelector('input[type="checkbox"]');
      expect(input).not.toBeNull();
    });

    it('renders hidden input', async () => {
      const node: UINode = {
        id: 'token',
        type: 'input',
        attributes: {
          name: 'token',
          type: 'hidden',
          value: 'secret-token',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const input = page.root!.shadowRoot!.querySelector('input[type="hidden"]');
      expect(input).not.toBeNull();
      expect(input!.getAttribute('value')).toBe('secret-token');
    });

    it('displays field error', async () => {
      const node: UINode = {
        id: 'email',
        type: 'input',
        attributes: {
          name: 'email',
          type: 'email',
        },
        meta: {
          label: 'Email',
        },
        messages: {
          error: 'Invalid email format',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const errorEl = page.root!.shadowRoot!.querySelector('.error-text');
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toBe('Invalid email format');
    });

    it('displays helper text', async () => {
      const node: UINode = {
        id: 'password',
        type: 'input',
        attributes: {
          name: 'password',
          type: 'password',
        },
        meta: {
          label: 'Password',
          helperText: 'Must be at least 8 characters',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const helperEl = page.root!.shadowRoot!.querySelector('.helper-text');
      expect(helperEl).not.toBeNull();
      expect(helperEl!.textContent).toBe('Must be at least 8 characters');
    });

    it('emits nodeChange on input', async () => {
      const node: UINode = {
        id: 'email',
        type: 'input',
        attributes: {
          name: 'email',
          type: 'email',
        },
        meta: {
          label: 'Email',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const nodeChangeSpy = jest.fn();
      page.root!.addEventListener('nodeChange', nodeChangeSpy);

      const input = page.root!.shadowRoot!.querySelector('input') as HTMLInputElement;
      input.value = 'test@example.com';
      input.dispatchEvent(new Event('input'));

      expect(nodeChangeSpy).toHaveBeenCalled();
      expect(nodeChangeSpy.mock.calls[0][0].detail.value).toBe('test@example.com');
    });
  });

  describe('button nodes', () => {
    it('renders submit button', async () => {
      const node: UINode = {
        id: 'submit',
        type: 'button',
        attributes: {
          type: 'submit',
        },
        meta: {
          label: 'Sign in',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const button = page.root!.shadowRoot!.querySelector('button');
      expect(button).not.toBeNull();
      expect(button!.getAttribute('type')).toBe('submit');
      expect(button!.textContent).toContain('Sign in');
    });

    it('renders disabled button', async () => {
      const node: UINode = {
        id: 'submit',
        type: 'button',
        attributes: {
          type: 'submit',
          disabled: true,
        },
        meta: {
          label: 'Sign in',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const button = page.root!.shadowRoot!.querySelector('button');
      expect(button!.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('social-button nodes', () => {
    it('renders social button', async () => {
      const node: UINode = {
        id: 'google',
        type: 'social-button',
        attributes: {
          provider: 'google',
        },
        meta: {
          label: 'Continue with Google',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const button = page.root!.shadowRoot!.querySelector('button');
      expect(button).not.toBeNull();
      expect(button!.classList.contains('btn-social')).toBe(true);
      expect(button!.classList.contains('btn-social-google')).toBe(true);
    });

    it('emits socialClick on click', async () => {
      const node: UINode = {
        id: 'google',
        type: 'social-button',
        attributes: {
          provider: 'google',
        },
        meta: {
          label: 'Continue with Google',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const socialClickSpy = jest.fn();
      page.root!.addEventListener('socialClick', socialClickSpy);

      const button = page.root!.shadowRoot!.querySelector('button');
      button!.click();

      expect(socialClickSpy).toHaveBeenCalled();
      expect(socialClickSpy.mock.calls[0][0].detail.provider).toBe('google');
    });
  });

  describe('text nodes', () => {
    it('renders title text', async () => {
      const node: UINode = {
        id: 'heading',
        type: 'text',
        meta: {
          title: 'Welcome back!',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const heading = page.root!.shadowRoot!.querySelector('h2');
      expect(heading).not.toBeNull();
      expect(heading!.textContent).toBe('Welcome back!');
    });

    it('renders description text', async () => {
      const node: UINode = {
        id: 'info',
        type: 'text',
        meta: {
          description: 'Enter your code to continue',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const paragraph = page.root!.shadowRoot!.querySelector('p');
      expect(paragraph).not.toBeNull();
      expect(paragraph!.textContent).toBe('Enter your code to continue');
    });
  });

  describe('divider nodes', () => {
    it('renders divider with text', async () => {
      const node: UINode = {
        id: 'divider',
        type: 'divider',
        meta: {
          label: 'or',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const divider = page.root!.shadowRoot!.querySelector('.divider');
      expect(divider).not.toBeNull();
      expect(divider!.textContent).toContain('or');
    });

    it('renders divider without text', async () => {
      const node: UINode = {
        id: 'divider',
        type: 'divider',
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const divider = page.root!.shadowRoot!.querySelector('.divider');
      expect(divider).not.toBeNull();
    });
  });

  describe('link nodes', () => {
    it('renders link', async () => {
      const node: UINode = {
        id: 'forgot',
        type: 'link',
        attributes: {
          href: '/forgot-password',
        },
        meta: {
          label: 'Forgot password?',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const link = page.root!.shadowRoot!.querySelector('a');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('/forgot-password');
      expect(link!.textContent).toBe('Forgot password?');
    });
  });

  describe('error nodes', () => {
    it('renders error message', async () => {
      const node: UINode = {
        id: 'error',
        type: 'error',
        meta: {
          title: 'Error',
          description: 'Something went wrong',
        },
        messages: {
          error: 'Connection failed',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const errorEl = page.root!.shadowRoot!.querySelector('.node-error');
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toContain('Connection failed');
    });
  });

  describe('success nodes', () => {
    it('renders success message', async () => {
      const node: UINode = {
        id: 'success',
        type: 'success',
        meta: {
          title: 'Success',
          description: 'Your account has been created',
        },
        messages: {
          success: 'Welcome aboard!',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const successEl = page.root!.shadowRoot!.querySelector('.node-success');
      expect(successEl).not.toBeNull();
      expect(successEl!.textContent).toContain('Welcome aboard!');
    });
  });

  describe('image nodes', () => {
    it('renders image', async () => {
      const node: UINode = {
        id: 'logo',
        type: 'image',
        attributes: {
          src: '/logo.png',
          alt: 'Company Logo',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const img = page.root!.shadowRoot!.querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('/logo.png');
      expect(img!.getAttribute('alt')).toBe('Company Logo');
    });
  });

  describe('disabled state', () => {
    it('disables input when disabled prop is true', async () => {
      const node: UINode = {
        id: 'email',
        type: 'input',
        attributes: {
          name: 'email',
          type: 'email',
        },
        meta: {
          label: 'Email',
        },
      };

      const page = await newSpecPage({
        components: [AuthheroNode],
        html: `<authhero-node disabled="true"></authhero-node>`,
      });

      page.rootInstance.node = node;
      await page.waitForChanges();

      const input = page.root!.shadowRoot!.querySelector('input');
      expect(input!.hasAttribute('disabled')).toBe(true);
    });
  });
});
