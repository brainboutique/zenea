<?php

use App\Mcp\Servers\EAApplications;
use Laravel\Mcp\Facades\Mcp;

Mcp::web('/mcp/Applications', EAApplications::class);
