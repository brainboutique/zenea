<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ConfigurationService;
use App\Services\DataPathResolver;
use App\Services\GitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class GitController extends Controller
{
    public function __construct(
        private GitService $git,
        private DataPathResolver $dataPathResolver,
        private ConfigurationService $config
    ) {
    }

    /**
     * Commit all changes in /data and push to the configured upstream Git repository.
     *
     * @OA\Post(
     *     path="/api/v1/{repoName}/{branch}/git/commit-and-push",
     *     operationId="gitCommitAndPushRepoBranch",
     *     tags={"Git"},
     *     summary="Commit and push",
     *     description="Stage all changes in /data/{repoName}/{branch}, commit with optional message, and push to the configured remote. Use repoName=local, branch=default for default data path.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\RequestBody(required=false, @OA\JsonContent(@OA\Property(property="message", type="string"))),
     *     @OA\Response(response="200", description="Result", @OA\JsonContent(
     *         @OA\Property(property="success", type="boolean"),
     *         @OA\Property(property="message", type="string"),
     *         @OA\Property(property="output", type="string", nullable=true),
     *         @OA\Property(property="error", type="string", nullable=true)
     *     )),
     *     @OA\Response(response="500", description="Configuration or runtime error")
     * )
     */
    public function commitAndPush(Request $request, string $repoName, string $branch): JsonResponse
    {
        $path = null;
        $repoName = trim($repoName);
        $branch = trim($branch);
        if ($repoName !== '' && $branch !== '') {
            try {
                $path = $this->dataPathResolver->resolve($repoName, $branch, null);
            } catch (\InvalidArgumentException $e) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 400);
            }
        }
        try {
            $message = $request->input('message');
            $result = $this->git->commitAndPush(is_string($message) ? $message : null, $path);
        } catch (RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }

        $status = $result['success'] ? 200 : 500;

        return response()->json($result, $status);
    }

    /**
     * Pull from upstream in the given repo/branch directory.
     * If the branch directory does not exist: optional query "basedOn" (remote branch name) creates it by cloning that branch into the subfolder and creating a new local branch named &lt;branch&gt;. If the branch directory already exists, returns an error when basedOn is provided; otherwise fetches and resets to origin/&lt;branch&gt;.
     *
     * @OA\Post(
     *     path="/api/v1/git/{repoName}/{branch}/pull",
     *     operationId="gitPull",
     *     tags={"Git"},
     *     summary="Pull (repo/branch)",
     *     description="Fetch and reset /data/{repoName}/{branch} to match origin. If the branch directory does not exist: pass basedOn (e.g. current branch) to create it by cloning that remote branch into the subfolder, then creating a new local branch named &lt;branch&gt;. Fails if the branch directory already exists when basedOn is provided.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name (directory under data root)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name (directory and local branch name)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="basedOn", in="query", required=false, description="When creating a new branch directory: remote branch to clone from (e.g. current branch). Omit for existing directories.", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Result", @OA\JsonContent(
     *         @OA\Property(property="success", type="boolean"),
     *         @OA\Property(property="message", type="string"),
     *         @OA\Property(property="output", type="string", nullable=true),
     *         @OA\Property(property="error", type="string", nullable=true)
     *     )),
     *     @OA\Response(response="400", description="Bad request (e.g. branch directory already exists)"),
     *     @OA\Response(response="500", description="Configuration or runtime error")
     * )
     */
    public function pull(Request $request, string $repoName, string $branch): JsonResponse
    {
        $basedOn = $request->query('basedOn');
        $basedOn = is_string($basedOn) ? trim($basedOn) : null;

        try {
            $result = $this->git->pullInRepoBranch($repoName, $branch, $basedOn);
        } catch (RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }

        $status = $result['success'] ? 200 : (str_contains($result['message'] ?? '', 'already exists') ? 400 : 500);

        return response()->json($result, $status);
    }

    /**
     * List all branches on the remote for all repositories.
     *
     * @OA\Get(
     *     path="/api/v1/git/branches",
     *     operationId="gitBranches",
     *     tags={"Git"},
     *     summary="List branches for all repositories",
     *     description="For each repository under the data root, returns its branches. Git-backed repositories include remote branches from origin with isCloned (true if the branch directory exists locally) and hasUncommittedChanges (true for the branch that is checked out in the working tree used to query). Non-GIT branches (plain directories without a Git work tree) are also listed with isGitControlled=false.",
     *     @OA\Response(
     *         response="200",
     *         description="Branches grouped by repository",
     *         @OA\JsonContent(
     *             @OA\Property(property="success", type="boolean"),
     *             @OA\Property(property="defaultRepo", type="string", description="Default repository name from server config"),
     *             @OA\Property(property="defaultBranch", type="string", description="Default branch name from server config"),
     *             @OA\Property(
     *                 property="repositories",
     *                 type="array",
     *                 @OA\Items(
     *                     type="object",
     *                     @OA\Property(property="repoName", type="string"),
     *                     @OA\Property(
     *                         property="branches",
     *                         type="array",
     *                         @OA\Items(
     *                             type="object",
     *                             @OA\Property(property="name", type="string"),
     *                             @OA\Property(property="isCloned", type="boolean", description="True if branch directory exists locally"),
     *                             @OA\Property(property="hasUncommittedChanges", type="boolean"),
     *                             @OA\Property(property="isGitControlled", type="boolean", description="True if this branch directory is inside a Git work tree")
     *                         )
     *                     )
     *                 )
     *             )
     *         )
     *     ),
     *     @OA\Response(response="500", description="Configuration or runtime error")
     * )
     */
    public function branches(): JsonResponse
    {
        try {
            $result = $this->git->branchesAllRepos();
        } catch (RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }

        if ($result['success'] ?? false) {
            $config = $this->config->getConfiguration();
            $result['defaultRepo'] = $config['defaultRepositoryName'] ?? 'local';
            $result['defaultBranch'] = $config['defaultBranch'] ?? 'default';
        }

        $status = $result['success'] ? 200 : 500;

        return response()->json($result, $status);
    }

    /**
     * Clone a repository into the Git data root.
     *
     * @OA\Post(
     *     path="/api/v1/git/clone",
     *     operationId="gitClone",
     *     tags={"Git"},
     *     summary="Clone repository",
     *     description="Clone a repository (OAuth URL) into /data/&lt;repo-name&gt;/&lt;default-branch&gt;. Fails if the repository directory already exists.",
     *     @OA\RequestBody(required=true, @OA\JsonContent(
     *         required={"repositoryUrl"},
     *         @OA\Property(property="repositoryUrl", type="string", example="https://oauth2:github_abcabc...@github.com/brainboutique/zenea-data-test.git")
     *     )),
     *     @OA\Response(response="200", description="Result", @OA\JsonContent(
     *         @OA\Property(property="success", type="boolean"),
     *         @OA\Property(property="message", type="string"),
     *         @OA\Property(property="output", type="string", nullable=true),
     *         @OA\Property(property="error", type="string", nullable=true),
     *         @OA\Property(property="repoName", type="string", description="Repository name (for frontend to set selected repo)"),
     *         @OA\Property(property="defaultBranch", type="string", description="Default branch name (e.g. main or master)")
     *     )),
     *     @OA\Response(response="400", description="Invalid payload"),
     *     @OA\Response(response="500", description="Configuration or runtime error")
     * )
     */
    public function cloneRepository(Request $request): JsonResponse
    {
        $repositoryUrl = $request->input('repositoryUrl');
        if (! is_string($repositoryUrl) || trim($repositoryUrl) === '') {
            return response()->json([
                'success' => false,
                'message' => 'Payload must include a non-empty \"repositoryUrl\" string.',
            ], 400);
        }

        try {
            $result = $this->git->cloneRepository($repositoryUrl);
        } catch (RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }

        $status = 200;
        if (! $result['success']) {
            // If the service already returned our specific message, keep 400 for user errors.
            $status = $result['message'] === 'Repository already exists.' ? 400 : 500;
        }

        return response()->json($result, $status);
    }
}
