<?php

namespace App\Mcp\Servers;

use App\Mcp\Tools\EAApplicationsGetInfo;
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Version;

#[Name('EA Applications')]
#[Version('0.0.1')]
#[Instructions('This server provides access to the various Application fact-sheets to obtain detailed information about all the applications existing. It should be used whenever the user requests information or summaries on applications, tools or information systems.')]
class EAApplications extends Server
{
    protected array $tools = [
        EAApplicationsGetInfo::class,
    ];

    protected array $resources = [
        //
    ];

    protected array $prompts = [
        //
    ];
}
