import {Inject, Injectable} from "@angular/core";
import {
    ActivatedRoute,
    ActivatedRouteSnapshot, CanActivate, Router,
    RouterStateSnapshot,
} from "@angular/router";
import {MSAL_CONFIG, MsalService} from "./msal.service";
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/pairwise';
import {Location, PlatformLocation} from "@angular/common";
import {BroadcastService} from "./broadcast.service";
import { Configuration, TemporaryCacheKeys } from "msal";
import {MSALError} from "./MSALError";
import {AuthenticationResult} from "./AuthenticationResult";

@Injectable()
export class MsalGuard implements CanActivate {

    constructor(@Inject(MSAL_CONFIG) private msalConfig: Configuration, private authService: MsalService, private router: Router, private activatedRoute: ActivatedRoute, private location: Location, private platformLocation: PlatformLocation, private broadcastService: BroadcastService) {
    }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | Promise<boolean> {
        this.authService.getLogger().verbose("location change event from old url to new url");

        this.authService.updateDataFromCache([this.msalConfig.auth.clientId]);
        if (!this.authService._oauthData.isAuthenticated && this.isObjectEmpty(this.authService._oauthData.idToken)) {
            if (state.url) {

                if (!this.authService._renewActive && !this.authService.loginInProgress()) {

                    var loginStartPage = this.getBaseUrl() + state.url;
                    if (loginStartPage !== null) {
                        this.authService.getCacheStorage().setItem(TemporaryCacheKeys.ANGULAR_LOGIN_REQUEST, loginStartPage);
                    }
                    if (this.msalConfig.framework.popUp) {
                        return this.authService.loginPopup({
                            scopes: this.msalConfig.framework.consentScopes,
                            extraQueryParameters: this.msalConfig.framework.extraQueryParameters
                        })
                            .then(function (token) {
                               return true;
                            }, function (error) {
                                return false;
                            });
                    }
                    else {
                        this.authService.loginRedirect({
                            scopes: this.msalConfig.framework.consentScopes,
                            extraQueryParameters: this.msalConfig.framework.extraQueryParameters
                        });
                    }
                }
            }
        }
        //token is expired/deleted but userdata still exists in _oauthData object
        else if (!this.authService._oauthData.isAuthenticated && !this.isObjectEmpty(this.authService._oauthData.idToken)) {
            return this.authService.acquireTokenSilent({
                scopes: [this.msalConfig.auth.clientId]
            })
                .then((token: any) => {
                    if (token) {
                        this.authService._oauthData.isAuthenticated = true;
                        var authenticationResult = new AuthenticationResult(token );
                        this.broadcastService.broadcast("msal:loginSuccess",  authenticationResult);
                        return true;
                    }

                }, (error: any) => {
                    var errorParts = error.split('|');
                    var msalError = new MSALError(errorParts[0], errorParts[1], "");
                    this.broadcastService.broadcast("msal:loginFailure", msalError);
                    return false;
                });
        }
        else {
            return true;
        }
    }

    private getBaseUrl(): String {
        var currentAbsoluteUrl = window.location.href;
        var currentRelativeUrl = this.location.path();
        if (this.isEmpty(currentRelativeUrl)) {
            if (currentAbsoluteUrl.endsWith("/")) {
                currentAbsoluteUrl = currentAbsoluteUrl.replace(/\/$/, '');
            }
            return currentAbsoluteUrl;
        }
        else {
            var index = currentAbsoluteUrl.indexOf(currentRelativeUrl);
            return currentAbsoluteUrl.substring(0, index);
        }
    }

    isEmpty = function (str: any) {
        return (typeof str === "undefined" || !str || 0 === str.length);
    };

    isObjectEmpty(obj: Object) {
        return Object.keys(obj).length === 0;
    };

}
