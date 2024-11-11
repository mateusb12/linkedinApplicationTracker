import json

import requests

# Define the URL with query parameters
url = (
    "https://www.linkedin.com/voyager/api/graphql?"
    "variables=(start:0,query:(flagshipSearchIntent:SEARCH_MY_ITEMS_JOB_SEEKER,"
    "queryParameters:List((key:cardType,value:List(APPLIED)))))&"
    "queryId=voyagerSearchDashClusters.8c4c84e04746a876c20b1eb6cd899df0"
)

# Define the headers
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Accept": "application/vnd.linkedin.normalized+json+2.1",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "x-li-lang": "en_US",
    "x-li-track": (
        '{"clientVersion":"1.13.26184","mpVersion":"1.13.26184","osName":"web",'
        '"timezoneOffset":-3,"timezone":"America/Sao_Paulo","deviceFormFactor":"DESKTOP",'
        '"mpName":"voyager-web","displayDensity":1,"displayWidth":1920,"displayHeight":1080}'
    ),
    "x-li-page-instance": "urn:li:page:d_flagship3_myitems_savedjobs;tn14fNyoSvyuuoLcKO4DqQ==",
    "csrf-token": "ajax:1145311051760055957",
    "x-restli-protocol-version": "2.0.0",
    "x-li-pem-metadata": "Voyager - My Items=myitems-saved-jobs",
    "Connection": "keep-alive",
    "Referer": "https://www.linkedin.com/my-items/saved-jobs/?cardType=APPLIED",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "TE": "trailers",
}

# Define the cookies
cookies = {
    "JSESSIONID": 'ajax:1145311051760055957',
    "bcookie": "v=2&e143f860-c4c3-4fae-8cd1-d1f466dfff0e",
    "bscookie": (
        "v=1&2024100521085977da93b5-041f-4fa4-8f1a-c263498d7b57AQEBvEF-ZifNd8wI_JWTIvW2HMEAn9-Q"
    ),
    "li_rm": (
        "AQHQRXN9vXtz1gAAAZJeg6mp1Tk8rkKNAs3CHhVQ5eugYw6-SZgPAxYvgY2S-KDvREVnNJTWpvLIJ59WzHvUcGxNenA5Y0dtXCJhNSD4w6Ej6K8i3zNcp3sX"
    ),
    "liap": "true",
    "li_at": (
        "AQEDAT016UkE6hVcAAABknbO4UIAAAGTQTNSU1YAvJAn_RkF7tdt84r_HaoC40viwEOWLpvsfRGcIXqmBVryUZV6Luxp_G68bfDu3_4q7mi9PefFdzDb_e0Wvs9w2uyZrk4m4zC7cM4jFKBYxNhoLXYM"
    ),
    "timezone": "America/Sao_Paulo",
    "li_theme": "light",
    "li_theme_set": "app",
    "UserMatchHistory": (
        "AQJMaFYrue6JWgAAAZMdbt7prkTaLO5vHFOgu1SBG1Vs_ElUFrDsHw8OPaYK1YRquI6kpsNvF_2onShd4aCKTd2h9Z5In3T2puAG8ikA9Ug4Eicys7BgSxBPe3NRgbwcvn-uI-cjxd94aIEmJRhWV5MFKO5eGwMdtVSFSV9RgnbaZiN0HSGuOABXQgeSncs440QpFxpYzjMVO8nyTg1rFEjCacGy8o8hJmb_7GgmbnEu7Xn_D8rDWukcrvpjqQ6vp1iUCiJeU8XRh_pa9XeDaHisnAN5Q-7S9KLliQ58l6TsnFwheu8CwVW6kceVRfdkWXalChcfSjaWKwxRXlg6"
    ),
    "dfpfpt": "fa45e1aa306b4d1c9f6b644269ce9048",
    "lang": "v=2&lang=en-us",
    "lidc": (
        'b=VB05:s=V:r=V:a=V:p=V:g=7753:u=240:x=1:i=1731360902:t=1731424341:v=2:sig=AQGMJmDqA66S5FWCPJOfqnKQlOesFbX3'
    ),
    "__cf_bm": "4um36H12lR5Rtpni3kl03F9paAIzYuuNKqTMneOu3SM-1731365428-1.0.1.1-Y5ZbNw1h5uCiwOGrIjwzM5fmeOkBWQmQaNWMdGm7NFKL9FfvDBd_7diRVf9Qy.Qn5QWsoPrEyXyVcS1kHPb2ow",
    "fptctx2": (
        "taBcrIH61PuCVH7eNCyH0LNKRXFdWqLJ6b8ywJyet7UD6lAprR0uO%^252fiIxQj2hwUd8NsWDtciZzNQNaHQUnPc6nIM7D2U87pq0RNBY6"
        "^%252b3FCsNou90TCJyLEH1dZo9qpzPvqA0z0WQr^%252fYtd8UKZ7e81wY27WvRpP2jKFwkGs6nTnNsNr1^%252fe1L4v^%252bi^%252bp8DrlPHJ7mDwb3i8cnV9zUnX3pxKz93LDbpBx4luqOeM6NKrKy7hMe^%252bXFJlao1fVCh2ltFAfIeyowU3pwTdlRvOqBTgbrCA9HjzSK3ZCrZhgbXXmQflW4Dn9IPDlhGXnTFRQ7g4uwMEkRP^%252bFL2pnbrBtc3oQVmnAt4Ilj1xvtCKe2oSHtAc^%253d"
    ),
}

response = requests.get(url, headers=headers, cookies=cookies)

# Check if the request was successful
if response.ok:
    # If the response is JSON, parse it and save it as a .json file
    try:
        data = response.json()
        # Save the JSON data to a file
        with open('response_data.json', 'w') as json_file:
            json.dump(data, json_file, indent=4)
        print("JSON data saved to 'response_data.json'")
    except ValueError:
        # If response is not JSON, print as text
        print(response.text)
else:
    print(f"Request failed with status code {response.status_code}")

