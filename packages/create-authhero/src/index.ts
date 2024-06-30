#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import fs from "fs";
import path from "path";

const program = new Command();

program
  .version("1.0.0")
  .description("Create a new AuthHero project")
  .argument("[project-name]", "name of the project")
  .action(async (projectName) => {
    if (!projectName) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "projectName",
          message: "Project name:",
          default: "auth-server",
          validate: (input) => input !== "" || "Project name cannot be empty",
        },
      ]);
      projectName = answers.projectName;
    }

    const projectPath = path.join(process.cwd(), projectName);

    if (fs.existsSync(projectPath)) {
      console.error(`Project "${projectName}" already exists.`);
      process.exit(1);
    }

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "description",
        message: "Project description:",
      },
      {
        type: "input",
        name: "author",
        message: "Author name:",
      },
    ]);

    fs.mkdirSync(projectPath);
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify(
        {
          name: projectName,
          version: "1.0.0",
          description: answers.description,
          author: answers.author,
          scripts: {
            start: "node index.js",
          },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(projectPath, "index.js"),
      `console.log('Welcome to AuthHero!');`,
    );
    console.log(`Project "${projectName}" has been created.`);
  });

program.parse(process.argv);
