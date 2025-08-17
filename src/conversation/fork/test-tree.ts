import { ForkTreeProvider } from './ForkTreeProvider';
import * as path from 'path';
import * as os from 'os';

/**
 * Test script for the ForkTreeProvider
 */
async function testForkTreeProvider(): Promise<void> {
    const treeProvider = new ForkTreeProvider();
    
    // Test with a real conversation file
    const testFile = path.join(
        os.homedir(), 
        '.claude', 
        'projects', 
        '-Users-pedroazevedo-workspace-claude-projects-VersionPlanExtension',
        '09191349-ac04-4f72-a7c7-ba86467476ec.jsonl'
    );

    try {
        console.log('🌳 Testing ForkTreeProvider...');
        console.log(`📁 Loading file: ${testFile}`);
        
        await treeProvider.loadConversationFile(testFile);
        
        console.log('✅ Conversation loaded successfully');
        
        // Test getting root items
        const rootItems = await treeProvider.getChildren();
        console.log(`📊 Root items: ${rootItems.length}`);
        
        for (const rootItem of rootItems) {
            console.log(`  📁 ${rootItem.label} (${rootItem.contextValue})`);
            
            // Get children of conversation item
            if (rootItem.contextValue === 'conversation') {
                const conversationChildren = await treeProvider.getChildren(rootItem);
                console.log(`    📊 Conversation children: ${conversationChildren.length}`);
                
                for (const child of conversationChildren) {
                    console.log(`      📁 ${child.label} (${child.contextValue}) - ${child.description || 'No description'}`);
                    
                    // If it's the forks section, get its children
                    if (child.contextValue === 'forks-section') {
                        const forkItems = await treeProvider.getChildren(child);
                        console.log(`        🔀 Fork items: ${forkItems.length}`);
                        
                        for (const forkItem of forkItems) {
                            console.log(`          🌿 ${forkItem.label} - ${forkItem.description || 'No description'}`);
                        }
                    }
                }
            }
        }
        
        const analysis = treeProvider.getCurrentAnalysis();
        if (analysis) {
            console.log('\n📈 Analysis Summary:');
            console.log(`  Fork Count: ${analysis.forkCount}`);
            console.log(`  Branch Count: ${analysis.branchCount}`);
            console.log(`  Token Distribution:`);
            console.log(`    Main Path: ${analysis.tokenDistribution.mainPath}`);
            console.log(`    Alternative: ${analysis.tokenDistribution.alternativeBranches}`);
            console.log(`    Abandoned: ${analysis.tokenDistribution.abandonedBranches}`);
        }

    } catch (error) {
        console.error('❌ Error testing ForkTreeProvider:', error);
    }
}

// Export for potential use in other tests
export { testForkTreeProvider };

// Run if called directly
if (require.main === module) {
    testForkTreeProvider();
}