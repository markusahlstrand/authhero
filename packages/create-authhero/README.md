Sure! Here's a `README.md` file for your CLI package:

````markdown
# create-authhero

`create-authhero` is a command-line tool for creating a new AuthHero project. It sets up a new project with the necessary configuration and template files, including SQLite templates.

## Usage

To create a new AuthHero project, run the following command:

```sh
npm create authhero <project-name>
```

If you don't specify a project name, you will be prompted to enter one.

### Example

```sh
npm create authhero my-auth-project
```

This will create a new directory named `my-auth-project` with the following structure:

```
my-auth-project
├── package.json
└── src
    └── ... (template files)
```

The generated project is a small wrapper around the [authhero](https://www.npmjs.com/package/authhero) npm library which makes it easy to keep up to date with the latest changes. All the files in the `src` directory are templates that you can modify to fit your needs.

### Options

- `project-name` (optional): The name of the new project. If not provided, you will be prompted to enter it.

## Project Setup

When you run the `create-authhero` command, you will be prompted to enter some additional information for your new project:

- Project name

These details will be included in the `package.json` file of your new project.

## Development

To contribute to this project, clone the repository and install the dependencies:

```sh
git clone https://github.com/markusahlstrand/authhero
cd create-authhero
npm install
```

## License

MIT

## Author

Markus Ahlstrand

## Acknowledgments

- [Commander.js](https://github.com/tj/commander.js) - Command-line interfaces made easy
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) - A collection of common interactive command line user interfaces
