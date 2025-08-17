import { ForkAnalyzer } from './ForkAnalyzer';
import * as path from 'path';
import * as os from 'os';

/**
 * Test script for the ForkAnalyzer
 * This will be used to validate our implementation
 */
async function testForkAnalyzer(): Promise<void> {
    const analyzer = new ForkAnalyzer();
    
    // Test with a real conversation file
    const testFile = path.join(
        os.homedir(), 
        '.claude', 
        'projects', 
        '-Users-pedroazevedo-workspace-claude-projects-VersionPlanExtension',
        '09191349-ac04-4f72-a7c7-ba86467476ec.jsonl'
    );

    try {
        console.log('🔍 Analyzing conversation file...');
        console.log(`📁 File: ${testFile}`);
        
        const result = await analyzer.analyzeConversationFile(testFile);
        
        console.log('\n📊 Analysis Results:');
        console.log(`├─ Session ID: ${result.tree.sessionId}`);
        console.log(`├─ Total Messages: ${result.tree.allMessages.size}`);
        console.log(`├─ Fork Count: ${result.forkCount}`);
        console.log(`├─ Branch Count: ${result.branchCount}`);
        console.log(`├─ Max Depth: ${result.tree.maxDepth}`);
        console.log(`└─ Total Tokens: ${result.tree.totalTokens}`);

        if (result.forkCount > 0) {
            console.log('\n🌳 Fork Details:');
            result.tree.forks.forEach((fork, index) => {
                console.log(`  Fork ${index + 1}:`);
                console.log(`  ├─ Parent: ${fork.parentUuid.substring(0, 8)}...`);
                console.log(`  ├─ Branches: ${fork.branches.length}`);
                console.log(`  ├─ Depth: ${fork.forkDepth}`);
                console.log(`  └─ Tokens: ${fork.totalTokens}`);
                
                fork.branches.forEach((branch, branchIndex) => {
                    console.log(`    Branch ${branchIndex + 1}:`);
                    console.log(`    ├─ Messages: ${branch.messages.length}`);
                    console.log(`    ├─ Tokens: ${branch.tokenCount}`);
                    console.log(`    ├─ Main Path: ${branch.isMainPath ? '✅' : '❌'}`);
                    console.log(`    └─ Active: ${branch.isActive ? '✅' : '❌'}`);
                });
            });
        }

        console.log('\n💰 Token Distribution:');
        console.log(`├─ Main Path: ${result.tokenDistribution.mainPath}`);
        console.log(`├─ Alternative Branches: ${result.tokenDistribution.alternativeBranches}`);
        console.log(`└─ Abandoned Branches: ${result.tokenDistribution.abandonedBranches}`);

        if (result.largestBranch) {
            console.log('\n🏆 Largest Branch:');
            console.log(`├─ Messages: ${result.largestBranch.messages.length}`);
            console.log(`├─ Tokens: ${result.largestBranch.tokenCount}`);
            console.log(`└─ Last Activity: ${result.largestBranch.lastActivity.toISOString()}`);
        }

    } catch (error) {
        console.error('❌ Error analyzing conversation:', error);
    }
}

// Export for potential use in other tests
export { testForkAnalyzer };

// Run if called directly
if (require.main === module) {
    testForkAnalyzer();
}