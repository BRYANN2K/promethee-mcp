import * as z from 'zod/v4';

import { boundedString, rfc3339Schema } from '../contracts/primitives.js';
import { createProjectSchema } from '../contracts/project.js';
import { createTaskSchema } from '../contracts/task.js';
import {
    createCreateProjectInputSchema,
    createCreateTaskInputSchema,
    createGetTaskInputSchema,
    createListProjectsInputSchema,
    createListTasksInputSchema
} from '../contracts/tool-inputs.js';
import { SYNTHETIC_SLICE_POLICY, type SlicePolicy } from '../policy/slice-policy.js';

export function createMcpSchemas(policy: SlicePolicy) {
    const taskSchema = createTaskSchema(policy);
    const projectSchema = createProjectSchema(policy);
    const responseMetadataShape = {
        observedAt: rfc3339Schema,
        freshness: z.literal('unknown'),
        sourceVersion: boundedString(policy.maxSourceVersionBytes, 'source version').nullable()
    };

    return {
        listTasksInputSchema: createListTasksInputSchema(policy),
        getTaskInputSchema: createGetTaskInputSchema(policy),
        listProjectsInputSchema: createListProjectsInputSchema(policy),
        createProjectInputSchema: createCreateProjectInputSchema(policy),
        createTaskInputSchema: createCreateTaskInputSchema(policy),
        taskSchema,
        projectSchema,
        listTasksOutputSchema: z.strictObject({
            tasks: z.array(taskSchema),
            ...responseMetadataShape,
            nextCursor: boundedString(policy.maxCursorBytes, 'cursor').nullable()
        }),
        getTaskOutputSchema: z.strictObject({
            task: taskSchema,
            ...responseMetadataShape
        }),
        listProjectsOutputSchema: z.strictObject({
            projects: z.array(projectSchema),
            ...responseMetadataShape,
            nextCursor: boundedString(policy.maxCursorBytes, 'cursor').nullable()
        }),
        createProjectOutputSchema: z.strictObject({
            project: projectSchema,
            ...responseMetadataShape
        }),
        createTaskOutputSchema: z.strictObject({
            task: taskSchema,
            ...responseMetadataShape
        })
    } as const;
}

const syntheticSchemas = createMcpSchemas(SYNTHETIC_SLICE_POLICY);
export const {
    listTasksInputSchema,
    getTaskInputSchema,
    listProjectsInputSchema,
    createProjectInputSchema,
    createTaskInputSchema,
    taskSchema,
    projectSchema,
    listTasksOutputSchema,
    getTaskOutputSchema,
    listProjectsOutputSchema,
    createProjectOutputSchema,
    createTaskOutputSchema
} = syntheticSchemas;

export type ListTasksInput = z.infer<typeof listTasksInputSchema>;
export type GetTaskInput = z.infer<typeof getTaskInputSchema>;
export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
