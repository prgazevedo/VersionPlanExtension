import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface TemplateVariables {
    projectName: string;
    description: string;
    techStack: string;
    author: string;
    date: string;
}

export class TemplateManager {
    private templatesPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.templatesPath = path.join(context.extensionPath, 'templates');
        this.ensureTemplatesExist();
    }

    private async ensureTemplatesExist(): Promise<void> {
        await fs.ensureDir(this.templatesPath);
        
        // Create default templates if they don't exist
        const templates = [
            { name: 'basic.md', content: this.getBasicTemplate() },
            { name: 'web-dev.md', content: this.getWebDevTemplate() },
            { name: 'data-science.md', content: this.getDataScienceTemplate() }
        ];

        for (const template of templates) {
            const templatePath = path.join(this.templatesPath, template.name);
            if (!await fs.pathExists(templatePath)) {
                await fs.writeFile(templatePath, template.content);
            }
        }
    }

    async getAvailableTemplates(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.templatesPath);
            return files.filter(file => file.endsWith('.md')).map(file => path.basename(file, '.md'));
        } catch {
            return ['basic', 'web-dev', 'data-science'];
        }
    }

    async processTemplate(templateName: string, variables: TemplateVariables): Promise<string> {
        try {
            const templatePath = path.join(this.templatesPath, `${templateName}.md`);
            let content = await fs.readFile(templatePath, 'utf8');

            // Replace variables in template
            content = content.replace(/\{\{projectName\}\}/g, variables.projectName);
            content = content.replace(/\{\{description\}\}/g, variables.description);
            content = content.replace(/\{\{techStack\}\}/g, variables.techStack);
            content = content.replace(/\{\{author\}\}/g, variables.author);
            content = content.replace(/\{\{date\}\}/g, variables.date);

            return content;
        } catch (error) {
            throw new Error(`Failed to process template: ${error}`);
        }
    }

    async collectVariables(): Promise<TemplateVariables | undefined> {
        try {
            const projectName = this.getProjectName();
            
            const description = await vscode.window.showInputBox({
                prompt: 'Enter project description',
                placeHolder: 'Brief description of the project'
            });

            if (!description) return undefined;

            const techStack = await vscode.window.showInputBox({
                prompt: 'Enter technology stack',
                placeHolder: 'e.g., Node.js, TypeScript, React'
            });

            if (!techStack) return undefined;

            const author = await vscode.window.showInputBox({
                prompt: 'Enter author name',
                placeHolder: 'Your name',
                value: process.env.USER || process.env.USERNAME || 'Unknown'
            });

            if (!author) return undefined;

            return {
                projectName,
                description,
                techStack,
                author,
                date: new Date().toISOString().split('T')[0]
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to collect variables: ${error}`);
            return undefined;
        }
    }

    private getProjectName(): string {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath);
        }
        return 'unnamed-project';
    }

    private getBasicTemplate(): string {
        return `# {{projectName}} - CLAUDE.md Configuration

## Project Information
- **Project Name**: {{projectName}}
- **Description**: {{description}}
- **Technology Stack**: {{techStack}}
- **Author**: {{author}}
- **Date**: {{date}}

## Project Context
This is a {{techStack}} project focused on {{description}}.

## Development Guidelines
- Follow best practices for {{techStack}}
- Maintain clean, readable code
- Write comprehensive tests
- Document important decisions

## Important Notes
- Add any specific instructions for Claude here
- Include relevant context about the project structure
- Note any special requirements or constraints
`;
    }

    private getWebDevTemplate(): string {
        return `# {{projectName}} - Web Development Configuration

## Project Information
- **Project Name**: {{projectName}}
- **Description**: {{description}}
- **Technology Stack**: {{techStack}}
- **Author**: {{author}}
- **Date**: {{date}}

## Project Structure
\`\`\`
src/
├── components/     # React components
├── pages/         # Page components
├── hooks/         # Custom hooks
├── utils/         # Utility functions
├── styles/        # CSS/SCSS files
└── tests/         # Test files
\`\`\`

## Development Guidelines
- Use functional components with hooks
- Implement responsive design
- Follow accessibility best practices
- Use TypeScript for type safety
- Write unit tests for components

## API Integration
- RESTful API endpoints
- Error handling and loading states
- Data validation and sanitization

## Deployment
- Build process: \`npm run build\`
- Test command: \`npm test\`
- Deployment target: [specify environment]

## Important Notes
- {{description}}
- Focus on performance optimization
- Maintain consistent code style
`;
    }

    private getDataScienceTemplate(): string {
        return `# {{projectName}} - Data Science Configuration

## Project Information
- **Project Name**: {{projectName}}
- **Description**: {{description}}
- **Technology Stack**: {{techStack}}
- **Author**: {{author}}
- **Date**: {{date}}

## Project Structure
\`\`\`
{{projectName}}/
├── data/          # Raw and processed data
├── notebooks/     # Jupyter notebooks
├── src/           # Source code
├── models/        # Trained models
├── tests/         # Test files
└── docs/          # Documentation
\`\`\`

## Data Pipeline
1. Data collection and ingestion
2. Data cleaning and preprocessing
3. Exploratory data analysis
4. Feature engineering
5. Model training and evaluation
6. Model deployment

## Development Guidelines
- Use version control for data and models
- Document data sources and transformations
- Implement proper data validation
- Follow reproducible research practices
- Use virtual environments

## Tools and Libraries
- {{techStack}}
- Data manipulation: pandas, numpy
- Visualization: matplotlib, seaborn
- Machine learning: scikit-learn, tensorflow/pytorch
- Version control: DVC (Data Version Control)

## Important Notes
- {{description}}
- Ensure data privacy and security
- Maintain reproducible experiments
- Document model performance metrics
`;
    }
}