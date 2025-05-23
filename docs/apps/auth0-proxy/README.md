# Auth0 Proxy

The Auth0 Proxy is a small proxy server that exposes the Auth0 Management API on a local port. It is primarily intended for testing and development purposes.

## Purpose

This proxy allows you to interact with the Auth0 Management API, which is particularly useful when developing and testing the AuthHero management portal. It provides a way to:

- Test AuthHero management features against real Auth0 data
- Develop against the Auth0 API without exposing credentials in your client-side code
- Debug authentication workflows in a controlled environment
- Work with multiple Auth0 tenants through a single endpoint

## Public Deployment

A public instance of the Auth0 Proxy is deployed and available at **https://proxy.authhe.ro**. This instance:

- Has no pre-configured environment variables
- Requires all configuration to be provided via request headers (`x-auth0-domain` and `authorization`)
- Is freely available for all AuthHero users

## Features

- Simple, lightweight proxy server
- Secure handling of Auth0 credentials
- Compatible with the AuthHero management portal
- Flexible configuration via environment variables or request headers
- Support for multi-tenant development workflows

For setup instructions, see the [Setup](setup.md) page. For configuration details, see the [Configuration](configuration.md) page.
