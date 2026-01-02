---
title: Code Style
description: Code style guidelines for AuthHero including TypeScript, React, naming conventions, formatting with Prettier, and linting with ESLint.
---

# Code Style

This document outlines the code style guidelines for the AuthHero project.

## General Guidelines

- Use TypeScript with strict mode enabled
- Follow functional programming principles where appropriate
- Write clean, readable, and maintainable code
- Add comments for complex logic, but prefer self-documenting code
- Keep functions small and focused on a single responsibility

## TypeScript Guidelines

- Enable strict mode in all TypeScript configurations
- Use explicit types whenever possible
- Use interfaces for object types
- Use type guards for runtime type checking
- Avoid using `any` type when possible

## React Guidelines

- Use functional components with hooks
- Use React's context API for state management when appropriate
- Follow component naming conventions (PascalCase for components)
- Keep components focused on a single responsibility

## Naming Conventions

- Use PascalCase for component names and type/interface names
- Use camelCase for variables, functions, and instance names
- Use UPPERCASE_SNAKE_CASE for constants
- Use descriptive names that convey meaning
- Prefer named exports over default exports

## Code Formatting

AuthHero uses Prettier for code formatting. The configuration is provided in the root of the repository.

## Linting

AuthHero uses ESLint with TypeScript and React rules. The configuration is provided in the root of the repository.

## Error Handling

- Use try/catch blocks for proper error handling
- Provide meaningful error messages
- Log errors when appropriate
- Prefer explicit error handling over generic catch-all blocks