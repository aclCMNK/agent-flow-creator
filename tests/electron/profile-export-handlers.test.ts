import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import {
  collectProfilesToExport,
  validateProfileFiles,
  exportAgentProfiles,
  type ProfileToExport,
} from '../../src/electron/profile-export-handlers';

let testProjectDir: string;

beforeAll(async () => {
  testProjectDir = join(tmpdir(), `test-profiles-${Date.now()}`);
  await mkdir(testProjectDir, { recursive: true });
});

afterAll(async () => {
  if (existsSync(testProjectDir)) {
    await rm(testProjectDir, { recursive: true });
  }
});

// ── Helper to build a minimal .adata JSON string ──────────────────────────
function makeAdata(agentName: string, profiles: object[]): string {
  return JSON.stringify({ agentName, profile: profiles });
}

// ── Helper to create a project with one agent ─────────────────────────────
async function createOneAgentProject(
  dir: string,
  agentName: string,
  profileContent: string,
): Promise<void> {
  await mkdir(join(dir, 'metadata'), { recursive: true });
  await mkdir(join(dir, 'behaviors'), { recursive: true });
  await writeFile(join(dir, 'behaviors/profile.md'), profileContent);
  await writeFile(
    join(dir, 'metadata/agent-1.adata'),
    makeAdata(agentName, [
      { id: '1', selector: 'System', filePath: 'behaviors/profile.md', order: 0, enabled: true },
    ]),
  );
}

// ══════════════════════════════════════════════════════════════════════════
// collectProfilesToExport
// ══════════════════════════════════════════════════════════════════════════

describe('profile-export-handlers', () => {
  describe('collectProfilesToExport', () => {
    test('reads agentName from top-level "agentName" field (not metadata.name)', async () => {
      const dir = join(testProjectDir, 'collect-agentname');
      const metadataDir = join(dir, 'metadata');
      await mkdir(metadataDir, { recursive: true });

      // Uses top-level agentName (canonical format)
      await writeFile(
        join(metadataDir, 'agent-1.adata'),
        JSON.stringify({
          agentName: 'Support Agent',
          profile: [
            { id: '1', selector: 'System', filePath: 'behaviors/system.md', order: 0, enabled: true },
          ],
        }),
      );

      const result = await collectProfilesToExport(dir);
      expect(result).toHaveLength(1);
      expect(result[0].agentName).toBe('Support Agent');
    });

    test('should collect agents with non-empty profile arrays', async () => {
      const metadataDir = join(testProjectDir, 'metadata');
      await mkdir(metadataDir, { recursive: true });

      // Create agent 1 with profiles (top-level agentName)
      await writeFile(
        join(metadataDir, 'agent-1.adata'),
        JSON.stringify({
          agentName: 'Agent One',
          profile: [
            { id: '1', selector: 'System', filePath: 'behaviors/agent-1/system.md', order: 0, enabled: true },
            { id: '2', selector: 'Memory', filePath: 'behaviors/agent-1/memory.md', order: 1, enabled: true },
          ],
        }),
      );

      // Create agent 2 without profiles
      await writeFile(
        join(metadataDir, 'agent-2.adata'),
        JSON.stringify({
          agentName: 'Agent Two',
          profile: [],
        }),
      );

      const result = await collectProfilesToExport(testProjectDir);

      expect(result).toHaveLength(1);
      expect(result[0].agentName).toBe('Agent One');
      expect(result[0].profiles).toHaveLength(2);
    });

    test('should sort profiles by order field', async () => {
      const sortTestDir = join(testProjectDir, 'sort-project');
      const metadataDir = join(sortTestDir, 'metadata');
      await mkdir(metadataDir, { recursive: true });

      await writeFile(
        join(metadataDir, 'agent.adata'),
        JSON.stringify({
          agentName: 'Test Agent',
          profile: [
            { id: '1', selector: 'System', filePath: 'f1.md', order: 2, enabled: true },
            { id: '2', selector: 'Memory', filePath: 'f2.md', order: 0, enabled: true },
            { id: '3', selector: 'Tools', filePath: 'f3.md', order: 1, enabled: true },
          ],
        }),
      );

      const result = await collectProfilesToExport(sortTestDir);
      const agent = result.find((a) => a.agentName === 'Test Agent');

      expect(agent).toBeDefined();
      expect(agent?.profiles[0].order).toBe(0);
      expect(agent?.profiles[1].order).toBe(1);
      expect(agent?.profiles[2].order).toBe(2);
    });

    test('should handle empty metadata directory', async () => {
      const emptyDir = join(testProjectDir, 'empty-project');
      await mkdir(emptyDir, { recursive: true });
      // No metadata dir — returns empty
      const result = await collectProfilesToExport(emptyDir);
      expect(result).toHaveLength(0);
    });

    test('falls back to agentId when agentName field is absent (legacy .adata)', async () => {
      const dir = join(testProjectDir, 'legacy-adata');
      const metadataDir = join(dir, 'metadata');
      await mkdir(metadataDir, { recursive: true });

      // Legacy: no top-level agentName, only metadata.name (should fall back to agentId)
      await writeFile(
        join(metadataDir, 'abc-123.adata'),
        JSON.stringify({
          metadata: { name: 'Legacy Name' },
          profile: [
            { id: '1', selector: 'System', filePath: 'f.md', order: 0, enabled: true },
          ],
        }),
      );

      const result = await collectProfilesToExport(dir);
      expect(result).toHaveLength(1);
      // Falls back to the file stem (agentId), NOT metadata.name
      expect(result[0].agentName).toBe('abc-123');
    });

    test('preserves agentName with spaces exactly', async () => {
      const dir = join(testProjectDir, 'spaces-collect');
      const metadataDir = join(dir, 'metadata');
      await mkdir(metadataDir, { recursive: true });

      await writeFile(
        join(metadataDir, 'agent-x.adata'),
        JSON.stringify({
          agentName: 'My Support Agent',
          profile: [{ id: '1', selector: 'System', filePath: 'f.md', order: 0, enabled: true }],
        }),
      );

      const result = await collectProfilesToExport(dir);
      expect(result[0].agentName).toBe('My Support Agent');
    });

    test('preserves agentName with special characters exactly', async () => {
      const dir = join(testProjectDir, 'specials-collect');
      const metadataDir = join(dir, 'metadata');
      await mkdir(metadataDir, { recursive: true });

      const specialName = 'Agente: Soporte & Ventas (v2.0)';
      await writeFile(
        join(metadataDir, 'agent-x.adata'),
        JSON.stringify({
          agentName: specialName,
          profile: [{ id: '1', selector: 'System', filePath: 'f.md', order: 0, enabled: true }],
        }),
      );

      const result = await collectProfilesToExport(dir);
      expect(result[0].agentName).toBe(specialName);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // validateProfileFiles
  // ══════════════════════════════════════════════════════════════════════════

  describe('validateProfileFiles', () => {
    test('should detect missing profile files', async () => {
      const validateTestDir = join(testProjectDir, 'validate-missing');
      const behaviorDir = join(validateTestDir, 'behaviors');
      await mkdir(behaviorDir, { recursive: true });

      await writeFile(join(behaviorDir, 'system.md'), 'content');

      const toExport: ProfileToExport[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          profiles: [
            { id: '1', selector: 'System', filePath: 'behaviors/system.md', order: 0, enabled: true },
            { id: '2', selector: 'Memory', filePath: 'behaviors/missing.md', order: 1, enabled: true },
          ],
        },
      ];

      const warnings = await validateProfileFiles(validateTestDir, toExport);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].filePath).toBe('behaviors/missing.md');
      expect(warnings[0].reason).toContain('file not found');
    });

    test('should skip disabled profiles from validation', async () => {
      await mkdir(join(testProjectDir, 'behaviors'), { recursive: true });
      await writeFile(join(testProjectDir, 'behaviors/file.md'), 'content');

      const toExport: ProfileToExport[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          profiles: [
            { id: '1', selector: 'System', filePath: 'behaviors/file.md', order: 0, enabled: true },
            { id: '2', selector: 'Memory', filePath: 'behaviors/missing.md', order: 1, enabled: false },
          ],
        },
      ];

      const warnings = await validateProfileFiles(testProjectDir, toExport);
      expect(warnings).toHaveLength(0);
    });

    test('should validate all files exist before returning', async () => {
      const testDir = join(testProjectDir, 'validate-test');
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });
      await writeFile(join(testDir, 'behaviors/system.md'), '# System');

      const toExport: ProfileToExport[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          profiles: [
            { id: '1', selector: 'System', filePath: 'behaviors/system.md', order: 0, enabled: true },
            { id: '2', selector: 'Memory', filePath: 'behaviors/memory.md', order: 1, enabled: true },
          ],
        },
      ];

      const warnings = await validateProfileFiles(testDir, toExport);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].reason).toContain('file not found');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // exportAgentProfiles — core behavior
  // ══════════════════════════════════════════════════════════════════════════

  describe('exportAgentProfiles', () => {
    test('should concatenate profiles without extra delimiters', async () => {
      const testDir = join(testProjectDir, 'concat-test');
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, 'metadata'), { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });

      await writeFile(join(testDir, 'behaviors/system.md'), '# System Prompt\nRole: assistant');
      await writeFile(join(testDir, 'behaviors/memory.md'), '# Memory\nStore facts');

      await writeFile(
        join(testDir, 'metadata/agent-1.adata'),
        JSON.stringify({
          agentName: 'TestAgent',
          profile: [
            { id: '1', selector: 'System', filePath: 'behaviors/system.md', order: 0, enabled: true },
            { id: '2', selector: 'Memory', filePath: 'behaviors/memory.md', order: 1, enabled: true },
          ],
        }),
      );

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(1);

      const exportedPath = result.exported[0].path;
      const content = await readFile(exportedPath, 'utf-8');
      expect(content).toBe('# System Prompt\nRole: assistant# Memory\nStore facts');
    });

    test('should skip disabled profiles', async () => {
      const testDir = join(testProjectDir, 'disabled-test');
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, 'metadata'), { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });

      await writeFile(join(testDir, 'behaviors/system.md'), 'System');
      await writeFile(join(testDir, 'behaviors/memory.md'), 'Memory');

      await writeFile(
        join(testDir, 'metadata/agent-1.adata'),
        JSON.stringify({
          agentName: 'TestAgent',
          profile: [
            { id: '1', selector: 'System', filePath: 'behaviors/system.md', order: 0, enabled: true },
            { id: '2', selector: 'Memory', filePath: 'behaviors/memory.md', order: 1, enabled: false },
          ],
        }),
      );

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      const content = await readFile(result.exported[0].path, 'utf-8');
      expect(content).toBe('System');
    });

    test('should create destination directories', async () => {
      const testDir = join(testProjectDir, 'mkdir-test');
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, 'metadata'), { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });

      await writeFile(join(testDir, 'behaviors/profile.md'), 'content');
      await writeFile(
        join(testDir, 'metadata/agent-1.adata'),
        JSON.stringify({
          agentName: 'TestAgent',
          profile: [{ id: '1', selector: 'System', filePath: 'behaviors/profile.md', order: 0, enabled: true }],
        }),
      );

      const exportDir = join(testDir, 'nested', 'export', 'path');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(existsSync(result.exported[0].path)).toBe(true);
    });

    test('should handle file conflicts with replace action', async () => {
      const conflictDir = join(testProjectDir, 'my-project');
      await mkdir(conflictDir, { recursive: true });
      await mkdir(join(conflictDir, 'metadata'), { recursive: true });
      await mkdir(join(conflictDir, 'behaviors'), { recursive: true });

      await writeFile(join(conflictDir, 'behaviors/profile.md'), 'new content');
      await writeFile(
        join(conflictDir, 'metadata/agent-1.adata'),
        JSON.stringify({
          agentName: 'TestAgent',
          profile: [{ id: '1', selector: 'System', filePath: 'behaviors/profile.md', order: 0, enabled: true }],
        }),
      );

      const exportDir = join(conflictDir, 'export');

      const firstResult = await exportAgentProfiles(conflictDir, exportDir, async () => 'replace');
      expect(firstResult.success).toBe(true);
      const exportedPath = firstResult.exported[0].path;

      await writeFile(join(conflictDir, 'behaviors/profile.md'), 'newer content');

      let conflictCalled = false;
      const result = await exportAgentProfiles(conflictDir, exportDir, async (_destPath) => {
        conflictCalled = true;
        return 'replace';
      });

      expect(conflictCalled).toBe(true);
      expect(result.success).toBe(true);

      const content = await readFile(exportedPath, 'utf-8');
      expect(content).toBe('newer content');
    });

    test('replace-all: onConflict called exactly once — remaining files overwritten silently', async () => {
      // Arrange: 3 agents, each with a profile file
      const testDir = join(testProjectDir, 'replace-all-test');
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, 'metadata'), { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });

      for (let i = 1; i <= 3; i++) {
        await writeFile(join(testDir, `behaviors/agent-${i}.md`), `New content ${i}`);
        await writeFile(
          join(testDir, `metadata/agent-${i}.adata`),
          JSON.stringify({
            agentName: `Agent${i}`,
            profile: [{ id: '1', selector: 'System', filePath: `behaviors/agent-${i}.md`, order: 0, enabled: true }],
          }),
        );
      }

      // First export creates the files — this establishes the conflicts for the next run
      const exportDir = join(testDir, 'export');
      await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      // Second export: all 3 agents conflict. User clicks "Replace All" on first prompt.
      let conflictCount = 0;
      const result = await exportAgentProfiles(testDir, exportDir, async () => {
        conflictCount++;
        return 'replace-all';
      });

      // All 3 should be exported successfully
      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(3);

      // KEY assertion: onConflict must have been called exactly once.
      // After replace-all is returned, the remaining 2 agents must be overwritten silently.
      expect(conflictCount).toBe(1);
    });

    test('replace-this: onConflict called once per conflicting file', async () => {
      // Arrange: 3 agents, all conflicting
      const testDir = join(testProjectDir, 'replace-this-test');
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, 'metadata'), { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });

      for (let i = 1; i <= 3; i++) {
        await writeFile(join(testDir, `behaviors/agent-${i}.md`), `Content ${i}`);
        await writeFile(
          join(testDir, `metadata/agent-${i}.adata`),
          JSON.stringify({
            agentName: `Agent${i}`,
            profile: [{ id: '1', selector: 'System', filePath: `behaviors/agent-${i}.md`, order: 0, enabled: true }],
          }),
        );
      }

      // First export establishes the conflict files
      const exportDir = join(testDir, 'export');
      await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      // Second export: user clicks "Replace This" for every conflict prompt
      let conflictCount = 0;
      const result = await exportAgentProfiles(testDir, exportDir, async () => {
        conflictCount++;
        return 'replace';
      });

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(3);

      // KEY assertion: every conflicting file must trigger an individual prompt
      expect(conflictCount).toBe(3);
    });

    test('cancel: export aborts after first cancel — no further conflict prompts raised', async () => {
      const cancelDir = join(testProjectDir, 'cancel-proj');
      await mkdir(cancelDir, { recursive: true });
      await mkdir(join(cancelDir, 'metadata'), { recursive: true });
      await mkdir(join(cancelDir, 'behaviors'), { recursive: true });

      for (let i = 1; i <= 3; i++) {
        await writeFile(join(cancelDir, `behaviors/agent-${i}.md`), `Content ${i}`);
        await writeFile(
          join(cancelDir, `metadata/agent-${i}.adata`),
          JSON.stringify({
            agentName: `Agent${i}`,
            profile: [{ id: '1', selector: 'System', filePath: `behaviors/agent-${i}.md`, order: 0, enabled: true }],
          }),
        );
      }

      // First export establishes conflicts
      const exportDir = join(cancelDir, 'export');
      await exportAgentProfiles(cancelDir, exportDir, async () => 'replace');

      // Second export: cancel on first conflict
      let callCount = 0;
      const result = await exportAgentProfiles(cancelDir, exportDir, async () => {
        callCount++;
        return 'cancel';
      });

      // Only one conflict prompt raised — then export aborts
      expect(callCount).toBe(1);
      expect(result.warnings.some((w) => w.includes('cancelled'))).toBe(true);
    });

    test('should collect warnings for missing files', async () => {
      const testDir = join(testProjectDir, 'warnings-test');
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, 'metadata'), { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });

      await writeFile(
        join(testDir, 'metadata/agent-1.adata'),
        JSON.stringify({
          agentName: 'TestAgent',
          profile: [
            { id: '1', selector: 'System', filePath: 'behaviors/missing.md', order: 0, enabled: true },
          ],
        }),
      );

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.skipped.some((s) => s.agentName === 'TestAgent')).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // agentName used verbatim — no modification ever
  // Tests special characters, spaces, long names
  // ══════════════════════════════════════════════════════════════════════════

  describe('agentName is used exactly as stored — never modified', () => {
    test('agentName with spaces produces file named "[spaces].md"', async () => {
      const testDir = join(testProjectDir, 'spaces-test');
      await createOneAgentProject(testDir, 'My Support Agent', 'content');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(1);
      // The basename of the written file must be "My Support Agent.md" — verbatim
      expect(basename(result.exported[0].path)).toBe('My Support Agent.md');
      expect(result.exported[0].agentName).toBe('My Support Agent');
    });

    test('agentName with special characters (colons, parens, ampersand) is preserved', async () => {
      const specialName = 'Soporte & Ventas (v2.0)';
      const testDir = join(testProjectDir, 'special-chars-test');
      await createOneAgentProject(testDir, specialName, 'content');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(1);
      expect(basename(result.exported[0].path)).toBe(`${specialName}.md`);
      expect(result.exported[0].agentName).toBe(specialName);
    });

    test('agentName with hyphens and underscores is preserved', async () => {
      const name = 'agent_one-v2';
      const testDir = join(testProjectDir, 'hyphens-underscores-test');
      await createOneAgentProject(testDir, name, 'content');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(basename(result.exported[0].path)).toBe(`${name}.md`);
    });

    test('agentName with unicode characters is preserved', async () => {
      const unicodeName = 'Agente Soporte 📋';
      const testDir = join(testProjectDir, 'unicode-test');
      await createOneAgentProject(testDir, unicodeName, 'content');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(1);
      expect(basename(result.exported[0].path)).toBe(`${unicodeName}.md`);
      expect(result.exported[0].agentName).toBe(unicodeName);
    });

    test('agentName with dots in name is preserved', async () => {
      const name = 'agent.v2.0';
      const testDir = join(testProjectDir, 'dots-test');
      await createOneAgentProject(testDir, name, 'content');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(basename(result.exported[0].path)).toBe(`${name}.md`);
    });

    test('long agentName (240 chars, safe for OS) is preserved and file is written successfully', async () => {
      // Linux/macOS ext4/HFS+ max filename = 255 chars.
      // The atomic write uses a .tmp suffix: "agentName.md.tmp" = name + 7 chars.
      // So safe name length = 255 - 7 = 248. We use 240 to be conservative.
      const longName = 'A'.repeat(240);
      const testDir = join(testProjectDir, 'long-name-test');
      await createOneAgentProject(testDir, longName, 'content');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(1);
      // The file is created with the exact name (plus .md)
      expect(basename(result.exported[0].path)).toBe(`${longName}.md`);
    });

    test('agentName that exceeds OS filename limit causes OS error — agent is skipped, not silently truncated', async () => {
      // A name > 248 chars will fail during atomic write (.md.tmp suffix pushes it over 255).
      // The requirement: ONLY alert/abort when OS returns error — never modify the name.
      // Expectation: agent is in skipped list with the OS error message.
      const tooLongName = 'B'.repeat(252); // 252 + 7 (.md.tmp) = 259 > 255
      const testDir = join(testProjectDir, 'too-long-name-test');
      await createOneAgentProject(testDir, tooLongName, 'content');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      // Export "fails" for this agent (OS error), but the flow does not crash
      expect(result.success).toBe(false); // no agents exported = success: false
      expect(result.skipped).toHaveLength(1);
      // The agentName in skipped is the ORIGINAL verbatim name — not truncated/modified
      expect(result.skipped[0].agentName).toBe(tooLongName);
      // The reason must contain the OS error (ENAMETOOLONG or similar)
      expect(result.skipped[0].reason).toContain('export failed:');
    });

    test('full path format is [exportDir]/prompts/[projectName]/[agentName].md', async () => {
      const testDir = join(testProjectDir, 'path-format-test');
      await createOneAgentProject(testDir, 'My Agent', 'content');

      const exportDir = join(testDir, 'export-out');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(1);

      const writtenPath = result.exported[0].path;
      const projectName = 'path-format-test'; // basename of testDir

      // Assert exact structure: exportDir/prompts/projectName/agentName.md
      const expectedPath = join(exportDir, 'prompts', projectName, 'My Agent.md');
      expect(writtenPath).toBe(expectedPath);
      expect(existsSync(writtenPath)).toBe(true);
    });

    test('agentName from .adata is not transformed — file content is correct', async () => {
      const name = 'Clasificador: Tickets y Soporte';
      const testDir = join(testProjectDir, 'content-verify-test');
      await createOneAgentProject(testDir, name, '# Prompt content here');

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);

      const writtenPath = result.exported[0].path;
      const content = await readFile(writtenPath, 'utf-8');
      expect(content).toBe('# Prompt content here');
    });

    test('agentName reported in skipped list when OS write fails is the verbatim name', async () => {
      // We test what's in the skipped list when all profiles fail to read —
      // the agentName in skipped must be the original, unmodified name.
      const name = 'Agent With Spaces & Stuff';
      const testDir = join(testProjectDir, 'skip-verbatim-test');
      await mkdir(join(testDir, 'metadata'), { recursive: true });

      await writeFile(
        join(testDir, 'metadata/agent-x.adata'),
        JSON.stringify({
          agentName: name,
          profile: [
            { id: '1', selector: 'System', filePath: 'behaviors/nonexistent.md', order: 0, enabled: true },
          ],
        }),
      );

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      // Should be in skipped with the original name — no sanitization
      const skippedAgent = result.skipped.find((s) => s.agentName === name);
      expect(skippedAgent).toBeDefined();
    });

    test('multiple agents with spaces and special chars — each gets its own correct file', async () => {
      const testDir = join(testProjectDir, 'multi-special-test');
      await mkdir(join(testDir, 'metadata'), { recursive: true });
      await mkdir(join(testDir, 'behaviors'), { recursive: true });

      const agents = [
        { id: 'a1', name: 'Agent Alpha', content: 'Alpha content' },
        { id: 'a2', name: 'Agent Beta & Gamma', content: 'Beta content' },
        { id: 'a3', name: 'Agent (Classifier)', content: 'Classifier content' },
      ];

      for (const agent of agents) {
        await writeFile(join(testDir, `behaviors/${agent.id}.md`), agent.content);
        await writeFile(
          join(testDir, `metadata/${agent.id}.adata`),
          JSON.stringify({
            agentName: agent.name,
            profile: [{ id: '1', selector: 'System', filePath: `behaviors/${agent.id}.md`, order: 0, enabled: true }],
          }),
        );
      }

      const exportDir = join(testDir, 'export');
      const result = await exportAgentProfiles(testDir, exportDir, async () => 'replace');

      expect(result.success).toBe(true);
      expect(result.exported).toHaveLength(3);

      // Verify each agent's file is named exactly after their agentName
      const exportedNames = result.exported.map((e) => basename(e.path));
      expect(exportedNames).toContain('Agent Alpha.md');
      expect(exportedNames).toContain('Agent Beta & Gamma.md');
      expect(exportedNames).toContain('Agent (Classifier).md');

      // Verify content
      for (const exportedItem of result.exported) {
        const originalAgent = agents.find((a) => `${a.name}.md` === basename(exportedItem.path));
        if (originalAgent) {
          const content = await readFile(exportedItem.path, 'utf-8');
          expect(content).toBe(originalAgent.content);
        }
      }
    });
  });
});
